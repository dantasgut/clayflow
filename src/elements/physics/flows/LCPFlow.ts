import type {
    EngineCore,
    Frame,
    UniformBufferSpec,
    StorageBufferSpec,
    StagingBufferSpec,
} from '../../../core/contracts/index';
import type { PipelineDescriptor } from '../../../scene/descriptors/PipelineDescriptor';
import { Flow } from '../../../scene/flows/Flow';
import type { PoolBufferSpec } from '../../../scene/contracts/PoolDirectory';
import type { Phase } from '../../../scene/flows/Flow';
import {
    createComputeKernel,
    destroyComputeKernel,
    type ComputeKernel,
} from '../../../scene/flows/createComputeKernel';
import type { ResourceSystem } from '../../../scene/systems/ResourceSystem';
import type { World } from '../../../scene/world/World';
import { Time } from '../../../scene/time/Time';
import { PerStepUniforms } from './PerStepUniforms';
import { LCPSchema } from '../bodies/schemas/LCPSchema';
import { NarrowphaseParamsSchema, RBSimParamsSchema } from '../schemas/simParams';
import {
    RBBodyCorrectionSchema,
    RBBodyDeltaSchema,
    RBContactSchema,
    RBWarmEntrySchema,
} from '../schemas/simState';
import { GravityField } from '../forcefields/GravityField';
import { Transform } from '../../scene/Transform';
import { ColliderSet } from '../colliders/ColliderSet';
import { AtomicAllocCounterSchema } from '../../gpu/compute/schemas';
import {
    rbBuildLcp,
    rbContactAccumulate,
    rbLcpCommit,
    rbNarrowphase,
    rbPredict,
    rbSolveLcp,
} from '../shaders/lcp';

/** Contatos por par no máximo: manifold de cantos de uma caixa. */
const RB_MAX_CONTACTS_PER_PAIR = 8;
/** Contatos por corpo na capacidade padrão da lista compactada (research R19). */
const DEFAULT_MAX_CONTACTS_PER_BODY = 32;

interface ShapePool {
    readonly poolKey: string;
    readonly bindingIndex: number;
    readonly entryPoint: string;
}

const SHAPE_POOLS: readonly ShapePool[] = [
    { poolKey: 'PlaneCollider', bindingIndex: 5, entryPoint: 'rb_narrowphase_plane_main' },
    { poolKey: 'BoxCollider', bindingIndex: 6, entryPoint: 'rb_narrowphase_box_main' },
    { poolKey: 'SphereCollider', bindingIndex: 7, entryPoint: 'rb_narrowphase_sphere_main' },
    { poolKey: 'MeshCollider', bindingIndex: 8, entryPoint: 'rb_narrowphase_mesh_main' },
];

/** Opções do `LCPFlow`. */
export interface LCPFlowOptions {
    /** Pool dos corpos rígidos (default `'LCPSchema'`). */
    readonly bodiesPoolKey?: string;
    /** Substeps de detecção + solve por passo de física (default 4). O passo vem do `Time` da cena. */
    readonly substeps?: number;
    /** Iterações do solve (Jacobi com divisão de massa) por substep (default 8). */
    readonly solveIters?: number;
    /**
     * Contatos por corpo na capacidade da lista compactada (default 32; uma caixa apoiada gera um contato por canto).
     * Capacidade = `min(corpos × colliders × 8, corpos × maxContactsPerBody, limite de binding do device / 96)`;
     * contatos acima dela
     * são contados e avisados.
     */
    readonly maxContactsPerBody?: number;
}

/**
 * LCPFlow — solver de RigidBody via LCP (Linear Complementarity Problem) com
 * 4 fases canônicas conforme arquitetura revisada: DetectContacts → AssembleA →
 * SolvePGS×K → Apply. O quadro executa `time.steps` passos de `time.stepDt` (o `Time` da cena, consultado
 * no World); cada passo faz predict, `substeps` iterações de detecção + solve e commit, cada iteração com a
 * sua região de parâmetros (`PerStepUniforms`, offset dinâmico — research A1). Etapas:
 *
 *   1. `rb_predict`        — integra gravidade + damping em `pos_pred`/`rot_pred`/`vel`
 *   2. narrowphase × N     — uma variante por pool de Collider (Plane/Box/Sphere/Mesh)
 *   3. `rb_build_lcp`      — preenche bias `b_vec` + diagonais Delassus por contato (massas divididas)
 *   4. `rb_solve_lcp`      — warm start + K iterações Jacobi com divisão de massa, paralelas por contato e por
 *                            corpo (research R19)
 *   5. `rb_contact_accumulate` + `rb_lcp_commit` — correção posicional por corpo; velocidades e pose
 *
 * Ao fim do frame, faz CPU readback do pool de bodies e publica a pose (posição e
 * rotação) no `Transform` de cada entidade; a mutação reativa leva a pose à GPU no
 * quadro seguinte e o `TransformFlow` produz a matriz de mundo. A escala do `Transform`
 * é do desenvolvedor e não é tocada. (O readback some na F2, quando a física escrever a
 * pose direto na GPU.)
 */
export class LCPFlow extends Flow {
    readonly type = 'LCPFlow';
    readonly bodyType = 'LCPSchema';
    readonly phase: Phase = 'physics';
    override priority = 10;

    private readonly bodiesPoolKey: string;
    private readonly substeps: number;
    private readonly solveIters: number;
    private readonly maxContactsPerBody: number;

    /** Região por passo (predict/commit) + uma por substep, ligadas por offset dinâmico. */
    private readonly params: PerStepUniforms;
    private contactsBuffer: StorageBufferSpec | null = null;
    private bVecBuffer: StorageBufferSpec | null = null;
    private contactsCapacity = 0;
    /** Contador `{ count, overflow }` da lista compactada — zerado antes de cada substep. */
    private counterBuffer: StorageBufferSpec | null = null;
    /** Tabela de warm start por par (hash) e sua capacidade (potência de 2). */
    private warmBuffer: StorageBufferSpec | null = null;
    private warmCapacity = 0;
    /** Correção posicional + contatos por corpo (`rb_contact_accumulate` → `rb_lcp_commit`). */
    private bodyContactBuffer: StorageBufferSpec | null = null;
    /** Δv/Δω por corpo do solve Jacobi (somas em ponto fixo, aplicadas e zeradas a cada iteração). */
    private bodyDeltaBuffer: StorageBufferSpec | null = null;
    /** Contatos por corpo no substep (divisão de massa) — contados na narrowphase. */
    private bodySplitBuffer: StorageBufferSpec | null = null;
    private bodyContactCapacity = 0;
    private accumulateKernel: ComputeKernel | null = null;
    /** Carimbo do substep corrente (warm start lê entradas do substep anterior). */
    private contactStamp = 0;
    private counterStaging: StagingBufferSpec | null = null;
    private overflowWarned = false;
    private bodiesStaging: StagingBufferSpec | null = null;
    private bodiesStagingByteSize = 0;

    private predictKernel: ComputeKernel | null = null;
    /** Gravidade por substep (`rb_apply_gravity_main`). */
    private gravityKernel: ComputeKernel | null = null;
    private readonly narrowphaseKernels = new Map<string, ComputeKernel>();
    private buildLcpKernel: ComputeKernel | null = null;
    /** Entradas do solve paralelo: warm start, iteração por contato, aplicação por corpo, gravação do warm start. */
    private solveKernels: {
        warmApply: ComputeKernel;
        contacts: ComputeKernel;
        apply: ComputeKernel;
        warmStore: ComputeKernel;
    } | null = null;
    private commitKernel: ComputeKernel | null = null;

    private readonly npParamsBuffers = new Map<string, UniformBufferSpec>();
    /** Pools de collider e mapas collider → corpo dono (compartilhado com a colisão dos fluidos). */
    private readonly colliders: ColliderSet;
    /** `colliders.generation` com que os kernels de narrowphase foram criados. */
    private narrowphaseGeneration = -1;

    private readbackInFlight = false;

    constructor(
        private readonly core: EngineCore,
        private readonly world: World,
        private readonly resources: ResourceSystem,
        options: LCPFlowOptions = {},
    ) {
        super();
        this.bodiesPoolKey = options.bodiesPoolKey ?? 'LCPSchema';
        this.substeps = Math.max(1, options.substeps ?? 4);
        this.solveIters = Math.max(1, options.solveIters ?? 8);
        this.maxContactsPerBody = Math.max(
            1,
            options.maxContactsPerBody ?? DEFAULT_MAX_CONTACTS_PER_BODY,
        );
        this.params = new PerStepUniforms(core, {
            discriminator: 'lcp_sim_params',
            schema: RBSimParamsSchema,
        });
        this.colliders = new ColliderSet(core, world, resources, {
            discriminator: 'lcp_colliders',
            bodiesPoolKey: this.bodiesPoolKey,
        });
    }

    getPipelineDescriptors(): readonly PipelineDescriptor[] {
        const list: PipelineDescriptor[] = [
            {
                id: 'pipeline_lcp_predict',
                role: 'compute',
                shader: rbPredict,
                entryPoints: ['rb_predict_main', 'rb_apply_gravity_main'],
                consumes: ['LCPSchema', 'GravityField'],
            },
            {
                id: 'pipeline_lcp_build',
                role: 'compute',
                shader: rbBuildLcp,
                entryPoints: ['rb_build_lcp'],
                consumes: ['LCPSchema'],
            },
            {
                id: 'pipeline_lcp_solve',
                role: 'compute',
                shader: rbSolveLcp,
                entryPoints: [
                    'rb_warm_apply_main',
                    'rb_solve_contacts_main',
                    'rb_apply_body_delta_main',
                    'rb_warm_store_main',
                ],
                consumes: ['LCPSchema'],
            },
            {
                id: 'pipeline_lcp_commit',
                role: 'compute',
                shader: rbLcpCommit,
                entryPoints: ['rb_lcp_commit_main'],
                consumes: ['LCPSchema'],
            },
        ];
        for (const shape of SHAPE_POOLS) {
            list.push({
                id: `pipeline_lcp_narrowphase_${shape.poolKey.toLowerCase()}`,
                role: 'compute',
                shader: rbNarrowphase,
                entryPoints: [shape.entryPoint],
                consumes: ['LCPSchema', shape.poolKey],
            });
        }
        return list;
    }

    /** Descarte do estágio: libera kernels, parâmetros, contatos, staging e buffers auxiliares. */
    override dispose(): void {
        this.invalidateAllKernels();
        this.params.dispose();
        this.releaseContacts();
        for (const spec of [
            this.counterBuffer,
            this.bodyContactBuffer,
            this.bodyDeltaBuffer,
            this.bodySplitBuffer,
            this.counterStaging,
        ]) {
            if (spec !== null) this.core.destroy(spec);
        }
        this.counterBuffer = null;
        this.bodyContactBuffer = null;
        this.bodyDeltaBuffer = null;
        this.bodySplitBuffer = null;
        this.bodyContactCapacity = 0;
        this.counterStaging = null;
        if (this.bodiesStaging !== null) this.core.destroy(this.bodiesStaging);
        this.bodiesStaging = null;
        this.bodiesStagingByteSize = 0;
        for (const buf of this.npParamsBuffers.values()) this.core.destroy(buf);
        this.npParamsBuffers.clear();
        this.colliders.destroy();
    }

    override isReady(): boolean {
        return this.resources.poolCount(this.bodiesPoolKey) > 0;
    }

    override onPoolReallocated(poolKey: string): void {
        this.colliders.onPoolReallocated(poolKey);
        if (poolKey === this.bodiesPoolKey) {
            this.invalidateAllKernels();
            this.releaseContacts();
            return;
        }
        if (SHAPE_POOLS.some((s) => s.poolKey === poolKey)) {
            this.invalidateNarrowphase(poolKey);
            this.releaseContacts();
        }
    }

    override onEntitiesInserted(_ids: readonly number[]): void {
        // Colliders novos entram nos mapas de dono.
        this.colliders.markDirty();
    }

    override onEntitiesRemoved(_ids: readonly number[]): void {
        // Mapas de dono precisam ser regerados — slots podem mudar.
        this.colliders.markDirty();
    }

    /** Libera e esquece todos os kernels (bind groups dependem de buffers que mudaram). */
    private invalidateAllKernels(): void {
        for (const k of [
            this.predictKernel,
            this.gravityKernel,
            this.buildLcpKernel,
            this.commitKernel,
            this.accumulateKernel,
            ...(this.solveKernels === null ? [] : Object.values(this.solveKernels)),
        ]) {
            if (k !== null) destroyComputeKernel(this.core, k);
        }
        this.predictKernel = null;
        this.gravityKernel = null;
        this.buildLcpKernel = null;
        this.solveKernels = null;
        this.commitKernel = null;
        this.accumulateKernel = null;
        for (const poolKey of [...this.narrowphaseKernels.keys()])
            this.invalidateNarrowphase(poolKey);
    }

    private invalidateNarrowphase(poolKey: string): void {
        const k = this.narrowphaseKernels.get(poolKey);
        if (k !== undefined) destroyComputeKernel(this.core, k);
        this.narrowphaseKernels.delete(poolKey);
    }

    /**
     * Capacidade da lista compactada de contatos (research R19): no máximo 8 contatos por par (cantos), `maxContactsPerBody`
     * por corpo e o que cabe num binding de storage do device.
     */
    contactCapacity(bodyCount: number, totalCol: number): number {
        const maxBinding =
            this.core.capabilities().limits.maxStorageBufferBindingSize ?? 134_217_728;
        return Math.max(
            1,
            Math.min(
                bodyCount * totalCol * RB_MAX_CONTACTS_PER_PAIR,
                bodyCount * this.maxContactsPerBody,
                Math.floor(maxBinding / RBContactSchema.stride),
            ),
        );
    }

    /** Lista compactada de contatos, bias e tabela de warm start para a capacidade atual; contador único. */
    private ensureContactsBuffer(
        bodyCount: number,
        totalCol: number,
    ): {
        contacts: StorageBufferSpec;
        bVec: StorageBufferSpec;
        counter: StorageBufferSpec;
        warm: StorageBufferSpec;
    } {
        const capacity = this.contactCapacity(bodyCount, totalCol);
        if (
            this.contactsBuffer === null
            || this.bVecBuffer === null
            || this.warmBuffer === null
            || this.contactsCapacity !== capacity
        ) {
            this.releaseContacts();
            this.contactsCapacity = capacity;
            this.contactsBuffer = this.core.create<StorageBufferSpec>({
                kind: 'buffer',
                subkind: 'storage',
                discriminator: `lcp_contacts_${capacity}`,
                byteSize: capacity * RBContactSchema.stride,
            });
            this.bVecBuffer = this.core.create<StorageBufferSpec>({
                kind: 'buffer',
                subkind: 'storage',
                discriminator: `lcp_bvec_${capacity}`,
                byteSize: Math.max(16, capacity * 4),
            });
            let warmCapacity = 1;
            while (warmCapacity < capacity * 2) warmCapacity *= 2;
            this.warmCapacity = warmCapacity;
            this.warmBuffer = this.core.create<StorageBufferSpec>({
                kind: 'buffer',
                subkind: 'storage',
                discriminator: `lcp_warm_${warmCapacity}`,
                byteSize: 2 * warmCapacity * RBWarmEntrySchema.stride,
            });
            this.invalidateAllKernels();
        }
        this.counterBuffer ??= this.core.create<StorageBufferSpec>({
            kind: 'buffer',
            subkind: 'storage',
            discriminator: 'lcp_contact_counter',
            byteSize: AtomicAllocCounterSchema.stride,
        });
        return {
            contacts: this.contactsBuffer,
            bVec: this.bVecBuffer,
            counter: this.counterBuffer,
            warm: this.warmBuffer,
        };
    }

    /**
     * Buffers por corpo, crescendo em potências de 2: correção posicional + contatos, Δv/Δω do solve e contatos por
     * corpo no substep (divisão de massa).
     */
    private ensureBodyBuffers(bodyCount: number): {
        correction: StorageBufferSpec;
        delta: StorageBufferSpec;
        split: StorageBufferSpec;
    } {
        if (
            this.bodyContactBuffer === null
            || this.bodyDeltaBuffer === null
            || this.bodySplitBuffer === null
            || this.bodyContactCapacity < bodyCount
        ) {
            for (const spec of [
                this.bodyContactBuffer,
                this.bodyDeltaBuffer,
                this.bodySplitBuffer,
            ]) {
                if (spec !== null) this.core.destroy(spec);
            }
            let capacity = Math.max(16, this.bodyContactCapacity);
            while (capacity < bodyCount) capacity *= 2;
            this.bodyContactCapacity = capacity;
            const create = (discriminator: string, byteSize: number) =>
                this.core.create<StorageBufferSpec>({
                    kind: 'buffer',
                    subkind: 'storage',
                    discriminator: `${discriminator}_${capacity}`,
                    byteSize,
                });
            this.bodyContactBuffer = create(
                'lcp_body_contact',
                capacity * RBBodyCorrectionSchema.stride,
            );
            this.bodyDeltaBuffer = create('lcp_body_delta', capacity * RBBodyDeltaSchema.stride);
            this.bodySplitBuffer = create('lcp_body_split', capacity * 4);
            // Kernels ligam os buffers antigos.
            this.invalidateAllKernels();
        }
        return {
            correction: this.bodyContactBuffer,
            delta: this.bodyDeltaBuffer,
            split: this.bodySplitBuffer,
        };
    }

    /** Destrói lista de contatos, bias e tabela de warm start (substituídas ao mudar a capacidade). */
    private releaseContacts(): void {
        if (this.contactsBuffer !== null) this.core.destroy(this.contactsBuffer);
        if (this.bVecBuffer !== null) this.core.destroy(this.bVecBuffer);
        if (this.warmBuffer !== null) this.core.destroy(this.warmBuffer);
        this.contactsBuffer = null;
        this.bVecBuffer = null;
        this.warmBuffer = null;
        this.contactsCapacity = 0;
        this.warmCapacity = 0;
    }

    private ensureNpParamsBuffer(poolKey: string): UniformBufferSpec {
        let buf = this.npParamsBuffers.get(poolKey);
        if (buf === undefined) {
            buf = this.core.create<UniformBufferSpec>({
                kind: 'buffer',
                subkind: 'uniform',
                discriminator: `lcp_np_params_${poolKey}`,
                byteSize: NarrowphaseParamsSchema.stride,
            });
            this.npParamsBuffers.set(poolKey, buf);
        }
        return buf;
    }

    /**
     * Preenche a região `region` de `RBSimParams`: `gravity.w` = dt da iteração (passo inteiro em predict/commit,
     * `stepDt / substeps` nos substeps), `dt_frame` = `stepDt`, capacidade da lista de contatos e carimbo do
     * substep (`contact_stamp`).
     */
    private fillSimParams(
        region: number,
        bodyCount: number,
        totalCol: number,
        iterationDt: number,
        stepDt: number,
        accel: readonly number[],
        stamp: number,
    ): void {
        this.params.write(region, {
            gravity: [accel[0] ?? 0, accel[1] ?? -9.81, accel[2] ?? 0, iterationDt],
            body_count: bodyCount,
            collider_count: totalCol,
            max_contacts: this.contactsCapacity,
            solve_iters: this.solveIters,
            dt_frame: stepDt,
            restitution: 0.2,
            penetration_slop: 0.005,
            linear_damping: 0.1,
            angular_damping: 0.1,
            contact_stamp: stamp >>> 0,
            predictive_threshold: 0.02,
            restitution_threshold: 0.5,
            sleep_lin_threshold: 0.05,
            warm_capacity: this.warmCapacity,
            baumgarte_beta: 0.2,
            warm_start_factor: 1.0,
        });
    }

    private uploadNpParams(
        poolKey: string,
        poolCount: number,
        poolBase: number,
        totalCol: number,
    ): void {
        const buf = this.ensureNpParamsBuffer(poolKey);
        this.core.write(
            buf,
            NarrowphaseParamsSchema.pack({
                pool_count: poolCount,
                pool_base: poolBase,
                total_col_count: totalCol,
            }),
        );
    }

    private ensurePredictKernels(bodiesBuf: PoolBufferSpec): void {
        if (this.predictKernel !== null && this.gravityKernel !== null) return;
        const kernel = (discriminator: string, entryPoint: string) =>
            createComputeKernel(this.core, {
                discriminator,
                shader: rbPredict,
                entryPoint,
                bindings: [
                    this.params.binding(0),
                    { binding: 1, type: 'storage', buffer: bodiesBuf },
                ],
            });
        this.predictKernel ??= kernel('lcp_predict', 'rb_predict_main');
        this.gravityKernel ??= kernel('lcp_gravity', 'rb_apply_gravity_main');
    }

    private ensureNarrowphaseKernel(
        shape: ShapePool,
        bodiesBuf: PoolBufferSpec,
        contacts: StorageBufferSpec,
        counter: StorageBufferSpec,
        warm: StorageBufferSpec,
        split: StorageBufferSpec,
    ): ComputeKernel | null {
        if (this.narrowphaseKernels.has(shape.poolKey)) {
            return this.narrowphaseKernels.get(shape.poolKey) ?? null;
        }
        const npParams = this.ensureNpParamsBuffer(shape.poolKey);
        const pool = this.colliders.pool(shape.poolKey);
        if (pool.count === 0) return null;
        const ownersBuf = pool.owners;
        const poolBuf = pool.buffer;
        const kernel = createComputeKernel(this.core, {
            discriminator: `lcp_narrowphase_${shape.poolKey}`,
            shader: rbNarrowphase,
            entryPoint: shape.entryPoint,
            bindings: [
                this.params.binding(0),
                { binding: 1, type: 'storage', buffer: bodiesBuf },
                { binding: 2, type: 'uniform', buffer: npParams },
                { binding: 3, type: 'read-only-storage', buffer: ownersBuf },
                { binding: 4, type: 'storage', buffer: contacts },
                { binding: shape.bindingIndex, type: 'read-only-storage', buffer: poolBuf },
                { binding: 9, type: 'storage', buffer: counter },
                { binding: 10, type: 'storage', buffer: warm },
                { binding: 11, type: 'storage', buffer: split },
            ],
        });
        this.narrowphaseKernels.set(shape.poolKey, kernel);
        return kernel;
    }

    private ensureBuildLcpKernel(
        bodiesBuf: PoolBufferSpec,
        contacts: StorageBufferSpec,
        bVec: StorageBufferSpec,
        counter: StorageBufferSpec,
        split: StorageBufferSpec,
    ): void {
        if (this.buildLcpKernel !== null) return;
        this.buildLcpKernel = createComputeKernel(this.core, {
            discriminator: 'lcp_build_lcp',
            shader: rbBuildLcp,
            entryPoint: 'rb_build_lcp',
            bindings: [
                this.params.binding(0),
                { binding: 1, type: 'read-only-storage', buffer: bodiesBuf },
                { binding: 2, type: 'storage', buffer: contacts },
                { binding: 3, type: 'storage', buffer: bVec },
                { binding: 4, type: 'read-only-storage', buffer: counter },
                { binding: 5, type: 'read-only-storage', buffer: split },
            ],
        });
    }

    private ensureSolveKernels(
        bodiesBuf: PoolBufferSpec,
        contacts: StorageBufferSpec,
        bVec: StorageBufferSpec,
        counter: StorageBufferSpec,
        warm: StorageBufferSpec,
        delta: StorageBufferSpec,
        split: StorageBufferSpec,
    ): NonNullable<LCPFlow['solveKernels']> {
        if (this.solveKernels !== null) return this.solveKernels;
        // Mesmo layout explícito para as quatro entradas do solve paralelo.
        const kernel = (entryPoint: string) =>
            createComputeKernel(this.core, {
                discriminator: `lcp_${entryPoint}`,
                shader: rbSolveLcp,
                entryPoint,
                bindings: [
                    this.params.binding(0),
                    { binding: 1, type: 'storage', buffer: bodiesBuf },
                    { binding: 2, type: 'storage', buffer: contacts },
                    { binding: 3, type: 'read-only-storage', buffer: bVec },
                    { binding: 4, type: 'read-only-storage', buffer: counter },
                    { binding: 5, type: 'storage', buffer: warm },
                    { binding: 6, type: 'storage', buffer: delta },
                    { binding: 7, type: 'read-only-storage', buffer: split },
                ],
            });
        this.solveKernels = {
            warmApply: kernel('rb_warm_apply_main'),
            contacts: kernel('rb_solve_contacts_main'),
            apply: kernel('rb_apply_body_delta_main'),
            warmStore: kernel('rb_warm_store_main'),
        };
        return this.solveKernels;
    }

    private ensureAccumulateKernel(
        contacts: StorageBufferSpec,
        counter: StorageBufferSpec,
        bodyContact: StorageBufferSpec,
    ): void {
        if (this.accumulateKernel !== null) return;
        this.accumulateKernel = createComputeKernel(this.core, {
            discriminator: 'lcp_contact_accumulate',
            shader: rbContactAccumulate,
            entryPoint: 'rb_contact_accumulate_main',
            bindings: [
                this.params.binding(0),
                { binding: 1, type: 'read-only-storage', buffer: contacts },
                { binding: 2, type: 'read-only-storage', buffer: counter },
                { binding: 3, type: 'storage', buffer: bodyContact },
            ],
        });
    }

    private ensureCommitKernel(bodiesBuf: PoolBufferSpec, bodyContact: StorageBufferSpec): void {
        if (this.commitKernel !== null) return;
        this.commitKernel = createComputeKernel(this.core, {
            discriminator: 'lcp_commit',
            shader: rbLcpCommit,
            entryPoint: 'rb_lcp_commit_main',
            bindings: [
                this.params.binding(0),
                { binding: 1, type: 'storage', buffer: bodiesBuf },
                { binding: 2, type: 'storage', buffer: bodyContact },
            ],
        });
    }

    dispatch(frame: Frame): void {
        const time = this.world.findResource(Time.schema, Time);
        const steps = time?.steps ?? 0;
        if (time === undefined || steps === 0) return;
        const bodyCount = this.resources.poolCount(this.bodiesPoolKey);
        if (bodyCount === 0) return;
        const bodiesBuf = this.resources.poolBufferSpec(this.bodiesPoolKey);
        if (bodiesBuf === undefined) return;

        // Mapas de dono e contagens por pool; offsets cumulativos dos pools na linha de contatos do corpo.
        this.colliders.refresh();
        if (this.colliders.generation !== this.narrowphaseGeneration) {
            for (const shape of SHAPE_POOLS) this.invalidateNarrowphase(shape.poolKey);
            this.narrowphaseGeneration = this.colliders.generation;
        }
        const poolInfo: {
            shape: ShapePool;
            count: number;
            base: number;
        }[] = [];
        let totalCol = 0;
        for (const shape of SHAPE_POOLS) {
            const count = this.colliders.pool(shape.poolKey).count;
            poolInfo.push({ shape, count, base: totalCol });
            totalCol += count;
        }
        for (const info of poolInfo) {
            if (info.count > 0) {
                this.uploadNpParams(info.shape.poolKey, info.count, info.base, totalCol);
            }
        }

        // Regiões: por passo, uma para predict/commit (dt do passo) e uma por substep.
        const perStep = this.substeps + 1;
        const regions = steps * perStep;
        if (this.params.reserve(regions)) this.invalidateAllKernels();
        // Buffers antes dos parâmetros: a capacidade da lista e da tabela entram em cada região.
        const { contacts, bVec, counter, warm } = this.ensureContactsBuffer(bodyCount, totalCol);
        const {
            correction: bodyContact,
            delta: bodyDelta,
            split: bodySplit,
        } = this.ensureBodyBuffers(bodyCount);
        const stepDt = time.stepDt;
        const accel = (this.world.findResource(GravityField.schema, GravityField)?.data
            .acceleration as readonly number[] | undefined) ?? [0, -9.81, 0, 0];
        // Carimbo de cada substep: a paridade escolhe a região da tabela de warm start que ele grava.
        const stamps: number[] = [];
        for (let step = 0; step < steps; step++) {
            const base = step * perStep;
            this.fillSimParams(base, bodyCount, totalCol, stepDt, stepDt, accel, this.contactStamp);
            for (let k = 0; k < this.substeps; k++) {
                this.contactStamp++;
                stamps.push(this.contactStamp);
                this.fillSimParams(
                    base + 1 + k,
                    bodyCount,
                    totalCol,
                    stepDt / this.substeps,
                    stepDt,
                    accel,
                    this.contactStamp,
                );
            }
        }
        this.params.flush(regions);

        this.ensurePredictKernels(bodiesBuf);
        this.ensureCommitKernel(bodiesBuf, bodyContact);
        this.ensureAccumulateKernel(contacts, counter, bodyContact);
        const predict = this.predictKernel;
        const gravity = this.gravityKernel;
        const commit = this.commitKernel;
        const accumulate = this.accumulateKernel;
        if (predict === null || gravity === null || commit === null || accumulate === null) return;

        for (let step = 0; step < steps; step++) {
            const stepOffset = [this.params.offset(step * perStep)];
            // Predict 1× por passo: damping, giroscópico e pose predita.
            frame.compute('LCPFlow.predict', (pass) => {
                pass.bind
                    .setPipeline(predict.pipeline)
                    .setBindGroup(0, predict.bindGroup, stepOffset);
                pass.dispatch.invocations(bodyCount, 64);
            });

            // Substeps: gravidade (g · dtSub), detecção de contato e solve — predict e commit ficam fora.
            for (let k = 0; k < this.substeps; k++) {
                const subOffset = [this.params.offset(step * perStep + 1 + k)];
                frame.compute('LCPFlow.gravity', (pass) => {
                    pass.bind
                        .setPipeline(gravity.pipeline)
                        .setBindGroup(0, gravity.bindGroup, subOffset);
                    pass.dispatch.invocations(bodyCount, 64);
                });
                if (totalCol === 0) continue;
                // Lista compactada, contatos por corpo e somas do solve recomeçam a cada substep; a região da
                // tabela de warm start que este substep grava é zerada (no fluxo de comandos — research A1).
                const stamp = stamps[step * this.substeps + k] ?? 0;
                const warmRegionBytes = this.warmCapacity * RBWarmEntrySchema.stride;
                frame.clear(counter);
                frame.clear(bodySplit);
                frame.clear(bodyDelta);
                frame.clear(warm, (stamp & 1) * warmRegionBytes, warmRegionBytes);

                // Fase 1 — DetectContacts (uma variante por pool não vazio)
                for (const info of poolInfo) {
                    if (info.count === 0) continue;
                    const kernel = this.ensureNarrowphaseKernel(
                        info.shape,
                        bodiesBuf,
                        contacts,
                        counter,
                        warm,
                        bodySplit,
                    );
                    if (kernel === null) continue;
                    const label = `LCPFlow.narrowphase.${info.shape.poolKey}`;
                    frame.compute(label, (pass) => {
                        pass.bind
                            .setPipeline(kernel.pipeline)
                            .setBindGroup(0, kernel.bindGroup, subOffset);
                        pass.dispatch.invocations(bodyCount * info.count, 64);
                    });
                }

                // Fase 2 — AssembleA
                this.ensureBuildLcpKernel(bodiesBuf, contacts, bVec, counter, bodySplit);
                const build = this.buildLcpKernel;
                if (build === null) continue;
                frame.compute('LCPFlow.buildLcp', (pass) => {
                    pass.bind
                        .setPipeline(build.pipeline)
                        .setBindGroup(0, build.bindGroup, subOffset);
                    pass.dispatch.invocations(this.contactsCapacity, 64);
                });

                // Fase 3 — warm start + K iterações Jacobi (contatos em paralelo, depois corpos em paralelo)
                const solve = this.ensureSolveKernels(
                    bodiesBuf,
                    contacts,
                    bVec,
                    counter,
                    warm,
                    bodyDelta,
                    bodySplit,
                );
                const run = (label: string, kernel: ComputeKernel, count: number) => {
                    frame.compute(label, (pass) => {
                        pass.bind
                            .setPipeline(kernel.pipeline)
                            .setBindGroup(0, kernel.bindGroup, subOffset);
                        pass.dispatch.invocations(count, 64);
                    });
                };
                run('LCPFlow.warmApply', solve.warmApply, this.contactsCapacity);
                run('LCPFlow.applyDelta', solve.apply, bodyCount);
                for (let it = 0; it < this.solveIters; it++) {
                    run('LCPFlow.solveContacts', solve.contacts, this.contactsCapacity);
                    run('LCPFlow.applyDelta', solve.apply, bodyCount);
                }
                run('LCPFlow.warmStore', solve.warmStore, this.contactsCapacity);
            }

            // Correção posicional por corpo a partir dos contatos do último substep.
            frame.clear(bodyContact);
            if (totalCol > 0) {
                frame.compute('LCPFlow.accumulate', (pass) => {
                    pass.bind
                        .setPipeline(accumulate.pipeline)
                        .setBindGroup(0, accumulate.bindGroup, stepOffset);
                    pass.dispatch.invocations(this.contactsCapacity, 64);
                });
            }

            // Commit 1× por passo: pos += vel·stepDt + correção posicional.
            frame.compute('LCPFlow.commit', (pass) => {
                pass.bind
                    .setPipeline(commit.pipeline)
                    .setBindGroup(0, commit.bindGroup, stepOffset);
                pass.dispatch.invocations(bodyCount, 64);
            });
        }

        this.schedulePosRotReadback(frame, bodiesBuf, bodyCount, counter);
    }

    /**
     * Copia o pool de bodies → staging dentro do frame atual e dispara readback
     * que resolve após `core.submit()`. Publica a pose em `Transform.data` (a marcação
     * de sujo é automática). Uma readback por frame (não acumula in-flight).
     */
    private schedulePosRotReadback(
        frame: Frame,
        bodiesBuf: PoolBufferSpec,
        bodyCount: number,
        counter: StorageBufferSpec,
    ): void {
        if (this.readbackInFlight) return;
        const byteSize = bodyCount * LCPSchema.stride;
        if (byteSize <= 0) return;
        if (this.bodiesStaging === null || this.bodiesStagingByteSize < byteSize) {
            // Sem leitura em voo (guarda acima): o staging anterior pode ser liberado.
            if (this.bodiesStaging !== null) this.core.destroy(this.bodiesStaging);
            this.bodiesStaging = this.core.create<StagingBufferSpec>({
                kind: 'buffer',
                subkind: 'staging',
                discriminator: `lcp_bodies_staging_${byteSize}`,
                byteSize,
            });
            this.bodiesStagingByteSize = byteSize;
        }
        const staging = this.bodiesStaging;
        frame.copy(bodiesBuf, staging, byteSize);
        // Contador da lista compactada do último substep: excedente de contatos vira aviso.
        const counterStaging = (this.counterStaging ??= this.core.create<StagingBufferSpec>({
            kind: 'buffer',
            subkind: 'staging',
            discriminator: 'lcp_contact_counter_staging',
            byteSize: AtomicAllocCounterSchema.stride,
        }));
        frame.copy(counter, counterStaging, AtomicAllocCounterSchema.stride);
        this.readbackInFlight = true;
        // Defer ao próximo macrotask: garante que core.submit() do frame atual
        // tenha rodado antes do mapAsync (sem isso, readback lê zeros).
        setTimeout(() => {
            this.core
                .readback(staging)
                .then(async (ab) => {
                    this.applyTransformsFromReadback(ab);
                    this.reportContactOverflow(await this.core.readback(counterStaging));
                })
                .catch(() => {
                    /* swallow */
                })
                .finally(() => {
                    this.readbackInFlight = false;
                });
        }, 0);
    }

    /** Avisa (uma vez) quando a narrowphase encontrou mais contatos que a capacidade da lista compactada. */
    protected reportContactOverflow(counter: ArrayBuffer): void {
        const u32 = new Uint32Array(counter);
        const count = u32[AtomicAllocCounterSchema.offsetOf('count') / 4] ?? 0;
        const overflow = u32[AtomicAllocCounterSchema.offsetOf('overflow') / 4] ?? 0;
        if (overflow === 0 || this.overflowWarned) return;
        this.overflowWarned = true;
        console.warn(
            `[LCPFlow] ${overflow} contatos acima da capacidade (${this.contactsCapacity}; ${count} encontrados no `
                + 'último substep) foram ignorados — aumente LCPFlowOptions.maxContactsPerBody.',
        );
    }

    /**
     * Publica a pose lida da GPU no `Transform` de cada corpo: só posição e rotação
     * (normalizada; nula ⇒ identidade). A escala não é tocada.
     */
    protected applyTransformsFromReadback(ab: ArrayBuffer): void {
        const view = new Float32Array(ab);
        const total = this.resources.poolCount(this.bodiesPoolKey);
        const stride = LCPSchema.stride / 4;
        const pos = LCPSchema.offsetOf('pos') / 4;
        const rot = LCPSchema.offsetOf('rot') / 4;
        for (let slot = 0; slot < total; slot++) {
            const eid = this.resources.poolEntityBySlot(this.bodiesPoolKey, slot);
            if (eid === undefined) continue;
            const base = slot * stride;
            if (base + stride > view.length) continue;
            const transform = this.world.resourcesOf(eid).find((r) => r instanceof Transform);
            if (transform === undefined) continue;
            const rx = view[base + rot] ?? 0;
            const ry = view[base + rot + 1] ?? 0;
            const rz = view[base + rot + 2] ?? 0;
            const rw = view[base + rot + 3] ?? 1;
            const len = Math.hypot(rx, ry, rz, rw);
            transform.data.position = [
                view[base + pos] ?? 0,
                view[base + pos + 1] ?? 0,
                view[base + pos + 2] ?? 0,
                1,
            ];
            transform.data.rotation =
                len > 1e-6 ? [rx / len, ry / len, rz / len, rw / len] : [0, 0, 0, 1];
        }
    }
}
