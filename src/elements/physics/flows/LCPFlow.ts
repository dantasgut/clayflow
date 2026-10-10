import type {
    EngineCore,
    Frame,
    UniformBufferSpec,
    StorageBufferSpec,
    StagingBufferSpec,
} from '../../../core/contracts/index';
import type { PipelineDescriptor } from '../../../scene/descriptors/PipelineDescriptor';
import { Flow } from '../../../scene/flows/Flow';
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
import { GravityField } from '../forcefields/GravityField';
import { Transform } from '../../scene/Transform';
import rigidBodyStruct from '../../gpu/wgsl/structs/rigid_body.wgsl?raw';
import rbSimParamsStruct from '../../gpu/wgsl/structs/rb_sim_params.wgsl?raw';
import rbContactStruct from '../../gpu/wgsl/structs/rb_contact.wgsl?raw';
import rbContactStateStruct from '../../gpu/wgsl/structs/rb_contact_state.wgsl?raw';
import colliderDescStructs from '../../gpu/wgsl/structs/collider_desc.wgsl?raw';
import quatLib from '../../gpu/wgsl/math/quat.wgsl?raw';
import impulseLib from '../../gpu/wgsl/math/impulse.wgsl?raw';
import contactMathLib from '../../gpu/wgsl/math/contact_math.wgsl?raw';
import lcpLib from '../../gpu/wgsl/math/lcp.wgsl?raw';
import sdfLib from '../../gpu/wgsl/math/sdf.wgsl?raw';
import xpbdLib from '../../gpu/wgsl/math/xpbd.wgsl?raw';
import rbPredictKernel from '../../gpu/wgsl/kernels/rb_predict.wgsl?raw';
import rbNarrowphaseKernel from '../../gpu/wgsl/kernels/rb_narrowphase.wgsl?raw';
import rbBuildLcpKernel from '../../gpu/wgsl/kernels/rb_build_lcp.wgsl?raw';
import rbSolveLcpKernel from '../../gpu/wgsl/kernels/rb_solve_lcp.wgsl?raw';
import rbLcpCommitKernel from '../../gpu/wgsl/kernels/rb_lcp_commit.wgsl?raw';
import rbContactAccumulateKernel from '../../gpu/wgsl/kernels/rb_contact_accumulate.wgsl?raw';

const PREDICT_SHADER = [
    rigidBodyStruct,
    rbSimParamsStruct,
    quatLib,
    impulseLib,
    rbPredictKernel,
].join('\n');

const NARROWPHASE_SHADER = [
    rigidBodyStruct,
    rbSimParamsStruct,
    rbContactStruct,
    rbContactStateStruct,
    colliderDescStructs,
    quatLib,
    impulseLib,
    sdfLib,
    rbNarrowphaseKernel,
].join('\n');

const BUILD_LCP_SHADER = [
    rigidBodyStruct,
    rbSimParamsStruct,
    rbContactStruct,
    quatLib,
    impulseLib,
    xpbdLib,
    contactMathLib,
    lcpLib,
    rbBuildLcpKernel,
].join('\n');

const SOLVE_LCP_SHADER = [
    rigidBodyStruct,
    rbSimParamsStruct,
    rbContactStruct,
    quatLib,
    impulseLib,
    xpbdLib,
    contactMathLib,
    lcpLib,
    rbContactStateStruct,
    rbSolveLcpKernel,
].join('\n');

const ACCUMULATE_SHADER = [rbSimParamsStruct, rbContactStruct, rbContactAccumulateKernel].join(
    '\n',
);

const COMMIT_SHADER = [
    rigidBodyStruct,
    rbSimParamsStruct,
    rbContactStruct,
    quatLib,
    impulseLib,
    xpbdLib,
    rbLcpCommitKernel,
].join('\n');

const RB_SIM_PARAMS_BYTE_SIZE = 80;
const NP_PARAMS_BYTE_SIZE = 16;
const RB_CONTACT_BYTE_SIZE = 80;
/** Bytes de `RBWarmEntry` (tabela de warm start). */
const RB_WARM_ENTRY_BYTE_SIZE = 32;
/** Bytes do contador da lista compactada (`RBContactCounter`). */
const RB_CONTACT_COUNTER_BYTE_SIZE = 16;
/** Contatos por corpo na capacidade padrão da lista compactada (research R19). */
const DEFAULT_MAX_CONTACTS_PER_BODY = 16;
const LCP_BODY_STRIDE_F32 = 40; // 160B / 4

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
    /** Iterações de Gauss-Seidel do solve por substep (default 8). */
    readonly solveIters?: number;
    /**
     * Contatos por corpo na capacidade da lista compactada (default 16). Capacidade =
     * `min(corpos × colliders, corpos × maxContactsPerBody, limite de binding do device / 80)`; contatos acima dela
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
 *   3. `rb_build_lcp`      — preenche bias `b_vec` + diagonais Delassus por contato
 *   4. `rb_solve_lcp`      — warm-start + K Gauss-Seidel (single-threaded por design)
 *   5. `rb_lcp_commit`     — escreve velocidades corrigidas + correção posicional
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
    /** Correção posicional + marca de contato por corpo (`rb_contact_accumulate` → `rb_lcp_commit`). */
    private bodyContactBuffer: StorageBufferSpec | null = null;
    private bodyContactCapacity = 0;
    private accumulateKernel: ComputeKernel | null = null;
    /** Carimbo do substep corrente (warm start lê entradas do substep anterior). */
    private contactStamp = 0;
    private counterStaging: StagingBufferSpec | null = null;
    private overflowWarned = false;
    private bodiesStaging: StagingBufferSpec | null = null;
    private bodiesStagingByteSize = 0;

    private predictKernel: ComputeKernel | null = null;
    private readonly narrowphaseKernels = new Map<string, ComputeKernel>();
    private buildLcpKernel: ComputeKernel | null = null;
    private solveLcpKernel: ComputeKernel | null = null;
    private commitKernel: ComputeKernel | null = null;

    private readonly npParamsBuffers = new Map<string, UniformBufferSpec>();
    private readonly bodyOwnersBuffers = new Map<string, StorageBufferSpec>();
    private readonly bodyOwnersCapacity = new Map<string, number>();

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
            byteSize: RB_SIM_PARAMS_BYTE_SIZE,
        });
    }

    getPipelineDescriptors(): readonly PipelineDescriptor[] {
        const list: PipelineDescriptor[] = [
            {
                id: 'pipeline_lcp_predict',
                role: 'compute',
                shaderSource: PREDICT_SHADER,
                entryPoints: ['rb_predict_main'],
                consumes: ['LCPSchema', 'GravityField'],
            },
            {
                id: 'pipeline_lcp_build',
                role: 'compute',
                shaderSource: BUILD_LCP_SHADER,
                entryPoints: ['rb_build_lcp'],
                consumes: ['LCPSchema'],
            },
            {
                id: 'pipeline_lcp_solve',
                role: 'compute',
                shaderSource: SOLVE_LCP_SHADER,
                entryPoints: ['rb_solve_lcp_main'],
                consumes: ['LCPSchema'],
            },
            {
                id: 'pipeline_lcp_commit',
                role: 'compute',
                shaderSource: COMMIT_SHADER,
                entryPoints: ['rb_lcp_commit_main'],
                consumes: ['LCPSchema'],
            },
        ];
        for (const shape of SHAPE_POOLS) {
            list.push({
                id: `pipeline_lcp_narrowphase_${shape.poolKey.toLowerCase()}`,
                role: 'compute',
                shaderSource: NARROWPHASE_SHADER,
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
        for (const spec of [this.counterBuffer, this.bodyContactBuffer, this.counterStaging]) {
            if (spec !== null) this.core.destroy(spec);
        }
        this.counterBuffer = null;
        this.bodyContactBuffer = null;
        this.bodyContactCapacity = 0;
        this.counterStaging = null;
        if (this.bodiesStaging !== null) this.core.destroy(this.bodiesStaging);
        this.bodiesStaging = null;
        this.bodiesStagingByteSize = 0;
        for (const buf of this.npParamsBuffers.values()) this.core.destroy(buf);
        for (const buf of this.bodyOwnersBuffers.values()) this.core.destroy(buf);
        this.npParamsBuffers.clear();
        this.bodyOwnersBuffers.clear();
        this.bodyOwnersCapacity.clear();
    }

    override isReady(): boolean {
        return this.resources.poolCount(this.bodiesPoolKey) > 0;
    }

    override onPoolReallocated(poolKey: string): void {
        if (poolKey === this.bodiesPoolKey) {
            this.invalidateAllKernels();
            this.releaseContacts();
            return;
        }
        if (SHAPE_POOLS.some((s) => s.poolKey === poolKey)) {
            this.invalidateNarrowphase(poolKey);
            this.releaseContacts();
            this.bodyOwnersCapacity.delete(poolKey);
        }
    }

    override onEntitiesRemoved(_ids: readonly number[]): void {
        // Mapas body_owners precisam ser regerados — slots podem mudar.
        for (const shape of SHAPE_POOLS) {
            this.bodyOwnersCapacity.delete(shape.poolKey);
        }
    }

    /** Libera e esquece todos os kernels (bind groups dependem de buffers que mudaram). */
    private invalidateAllKernels(): void {
        for (const k of [
            this.predictKernel,
            this.buildLcpKernel,
            this.solveLcpKernel,
            this.commitKernel,
            this.accumulateKernel,
        ]) {
            if (k !== null) destroyComputeKernel(this.core, k);
        }
        this.predictKernel = null;
        this.buildLcpKernel = null;
        this.solveLcpKernel = null;
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
     * Capacidade da lista compactada de contatos (research R19): no máximo um contato por par, `maxContactsPerBody`
     * por corpo e o que cabe num binding de storage do device.
     */
    contactCapacity(bodyCount: number, totalCol: number): number {
        const maxBinding =
            this.core.capabilities().limits.maxStorageBufferBindingSize ?? 134_217_728;
        return Math.max(
            1,
            Math.min(
                bodyCount * totalCol,
                bodyCount * this.maxContactsPerBody,
                Math.floor(maxBinding / RB_CONTACT_BYTE_SIZE),
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
                byteSize: capacity * RB_CONTACT_BYTE_SIZE,
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
                byteSize: warmCapacity * RB_WARM_ENTRY_BYTE_SIZE,
            });
            this.invalidateAllKernels();
        }
        this.counterBuffer ??= this.core.create<StorageBufferSpec>({
            kind: 'buffer',
            subkind: 'storage',
            discriminator: 'lcp_contact_counter',
            byteSize: RB_CONTACT_COUNTER_BYTE_SIZE,
        });
        return {
            contacts: this.contactsBuffer,
            bVec: this.bVecBuffer,
            counter: this.counterBuffer,
            warm: this.warmBuffer,
        };
    }

    /** Correção posicional por corpo (`vec4f` por corpo), crescendo em potências de 2. */
    private ensureBodyContactBuffer(bodyCount: number): StorageBufferSpec {
        if (this.bodyContactBuffer === null || this.bodyContactCapacity < bodyCount) {
            if (this.bodyContactBuffer !== null) this.core.destroy(this.bodyContactBuffer);
            let capacity = Math.max(16, this.bodyContactCapacity);
            while (capacity < bodyCount) capacity *= 2;
            this.bodyContactCapacity = capacity;
            this.bodyContactBuffer = this.core.create<StorageBufferSpec>({
                kind: 'buffer',
                subkind: 'storage',
                discriminator: `lcp_body_contact_${capacity}`,
                byteSize: capacity * 16,
            });
            // Commit e acumulação ligam o buffer antigo.
            if (this.commitKernel !== null) destroyComputeKernel(this.core, this.commitKernel);
            if (this.accumulateKernel !== null)
                destroyComputeKernel(this.core, this.accumulateKernel);
            this.commitKernel = null;
            this.accumulateKernel = null;
        }
        return this.bodyContactBuffer;
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
                byteSize: NP_PARAMS_BYTE_SIZE,
            });
            this.npParamsBuffers.set(poolKey, buf);
        }
        return buf;
    }

    private ensureBodyOwnersBuffer(poolKey: string, count: number): StorageBufferSpec {
        const minBytes = Math.max(16, count * 4);
        let buf = this.bodyOwnersBuffers.get(poolKey);
        const cap = this.bodyOwnersCapacity.get(poolKey) ?? 0;
        if (buf === undefined || cap < count) {
            if (buf !== undefined) this.core.destroy(buf);
            buf = this.core.create<StorageBufferSpec>({
                kind: 'buffer',
                subkind: 'storage',
                discriminator: `lcp_body_owners_${poolKey}_${count}`,
                byteSize: minBytes,
            });
            this.bodyOwnersBuffers.set(poolKey, buf);
            this.bodyOwnersCapacity.set(poolKey, count);
            this.invalidateNarrowphase(poolKey); // bind group precisa refazer
        }
        return buf;
    }

    /** Itera o pool de uma shape e escreve `body_owners[slot] = rb_idx` ou 0xFFFFFFFFu. */
    private rebuildBodyOwners(poolKey: string): number {
        const entityIds = this.world.queryBySchemaName(poolKey);
        const count = entityIds.length;
        if (count === 0) return 0;
        const buf = this.ensureBodyOwnersBuffer(poolKey, count);
        const owners = new Uint32Array(Math.max(4, count));
        owners.fill(0xffffffff);
        for (let i = 0; i < count; i++) {
            const eid = entityIds[i]!;
            const slotInPool = this.resources.poolSlotOf(poolKey, eid);
            if (slotInPool === undefined) continue;
            const rbSlot = this.resources.poolSlotOf(this.bodiesPoolKey, eid);
            if (rbSlot !== undefined) {
                owners[slotInPool] = rbSlot;
            }
        }
        this.core.write(buf, new Uint8Array(owners.buffer));
        return count;
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
        const f32 = this.params.f32(region);
        const u32 = this.params.u32(region);
        f32[0] = accel[0] ?? 0;
        f32[1] = accel[1] ?? -9.81;
        f32[2] = accel[2] ?? 0;
        f32[3] = iterationDt;
        u32[4] = bodyCount;
        u32[5] = totalCol;
        u32[6] = this.contactsCapacity;
        u32[7] = this.solveIters;
        f32[8] = stepDt;
        f32[9] = 0.2; // restitution global default
        f32[10] = 0.005; // penetration_slop
        f32[11] = 0.1; // linear_damping
        f32[12] = 0.1; // angular_damping
        u32[13] = stamp >>> 0; // contact_stamp
        f32[14] = 0.02; // predictive_threshold
        f32[15] = 0.5; // restitution_threshold
        f32[16] = 0.05; // sleep_lin_threshold
        u32[17] = this.warmCapacity; // warm_capacity
        f32[18] = 0.2; // baumgarte_beta
        f32[19] = 0.9; // warm_start_factor
    }

    private uploadNpParams(
        poolKey: string,
        poolCount: number,
        poolBase: number,
        totalCol: number,
    ): void {
        const buf = this.ensureNpParamsBuffer(poolKey);
        const arr = new ArrayBuffer(NP_PARAMS_BYTE_SIZE);
        const u32 = new Uint32Array(arr);
        u32[0] = poolCount;
        u32[1] = poolBase;
        u32[2] = totalCol;
        u32[3] = 0;
        this.core.write(buf, new Uint8Array(arr));
    }

    private ensurePredictKernel(bodiesBuf: StorageBufferSpec): void {
        if (this.predictKernel !== null) return;
        this.predictKernel = createComputeKernel(this.core, {
            discriminator: 'lcp_predict',
            shaderSource: PREDICT_SHADER,
            entryPoint: 'rb_predict_main',
            bindings: [this.params.binding(0), { binding: 1, type: 'storage', buffer: bodiesBuf }],
        });
    }

    private ensureNarrowphaseKernel(
        shape: ShapePool,
        bodiesBuf: StorageBufferSpec,
        contacts: StorageBufferSpec,
        counter: StorageBufferSpec,
        warm: StorageBufferSpec,
    ): ComputeKernel | null {
        if (this.narrowphaseKernels.has(shape.poolKey)) {
            return this.narrowphaseKernels.get(shape.poolKey) ?? null;
        }
        const npParams = this.ensureNpParamsBuffer(shape.poolKey);
        const ownersBuf = this.bodyOwnersBuffers.get(shape.poolKey);
        const poolBuf = this.resources.poolBufferSpec(shape.poolKey);
        if (ownersBuf === undefined || poolBuf === undefined) return null;
        const kernel = createComputeKernel(this.core, {
            discriminator: `lcp_narrowphase_${shape.poolKey}`,
            shaderSource: NARROWPHASE_SHADER,
            entryPoint: shape.entryPoint,
            bindings: [
                this.params.binding(0),
                { binding: 1, type: 'storage', buffer: bodiesBuf },
                { binding: 2, type: 'uniform', buffer: npParams },
                { binding: 3, type: 'read-only-storage', buffer: ownersBuf },
                { binding: 4, type: 'storage', buffer: contacts },
                { binding: shape.bindingIndex, type: 'read-only-storage', buffer: poolBuf },
                { binding: 9, type: 'storage', buffer: counter },
                { binding: 10, type: 'read-only-storage', buffer: warm },
            ],
        });
        this.narrowphaseKernels.set(shape.poolKey, kernel);
        return kernel;
    }

    private ensureBuildLcpKernel(
        bodiesBuf: StorageBufferSpec,
        contacts: StorageBufferSpec,
        bVec: StorageBufferSpec,
        counter: StorageBufferSpec,
    ): void {
        if (this.buildLcpKernel !== null) return;
        this.buildLcpKernel = createComputeKernel(this.core, {
            discriminator: 'lcp_build_lcp',
            shaderSource: BUILD_LCP_SHADER,
            entryPoint: 'rb_build_lcp',
            bindings: [
                this.params.binding(0),
                { binding: 1, type: 'read-only-storage', buffer: bodiesBuf },
                { binding: 2, type: 'storage', buffer: contacts },
                { binding: 3, type: 'storage', buffer: bVec },
                { binding: 4, type: 'read-only-storage', buffer: counter },
            ],
        });
    }

    private ensureSolveLcpKernel(
        bodiesBuf: StorageBufferSpec,
        contacts: StorageBufferSpec,
        bVec: StorageBufferSpec,
        counter: StorageBufferSpec,
        warm: StorageBufferSpec,
    ): void {
        if (this.solveLcpKernel !== null) return;
        this.solveLcpKernel = createComputeKernel(this.core, {
            discriminator: 'lcp_solve_lcp',
            shaderSource: SOLVE_LCP_SHADER,
            entryPoint: 'rb_solve_lcp_main',
            bindings: [
                this.params.binding(0),
                { binding: 1, type: 'storage', buffer: bodiesBuf },
                { binding: 2, type: 'storage', buffer: contacts },
                { binding: 3, type: 'read-only-storage', buffer: bVec },
                { binding: 4, type: 'read-only-storage', buffer: counter },
                { binding: 5, type: 'storage', buffer: warm },
            ],
        });
    }

    private ensureAccumulateKernel(
        contacts: StorageBufferSpec,
        counter: StorageBufferSpec,
        bodyContact: StorageBufferSpec,
    ): void {
        if (this.accumulateKernel !== null) return;
        this.accumulateKernel = createComputeKernel(this.core, {
            discriminator: 'lcp_contact_accumulate',
            shaderSource: ACCUMULATE_SHADER,
            entryPoint: 'rb_contact_accumulate_main',
            bindings: [
                this.params.binding(0),
                { binding: 1, type: 'read-only-storage', buffer: contacts },
                { binding: 2, type: 'read-only-storage', buffer: counter },
                { binding: 3, type: 'storage', buffer: bodyContact },
            ],
        });
    }

    private ensureCommitKernel(bodiesBuf: StorageBufferSpec, bodyContact: StorageBufferSpec): void {
        if (this.commitKernel !== null) return;
        this.commitKernel = createComputeKernel(this.core, {
            discriminator: 'lcp_commit',
            shaderSource: COMMIT_SHADER,
            entryPoint: 'rb_lcp_commit_main',
            bindings: [
                this.params.binding(0),
                { binding: 1, type: 'storage', buffer: bodiesBuf },
                { binding: 2, type: 'read-only-storage', buffer: bodyContact },
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

        // Re-resolve body_owners por pool e calcula offsets cumulativos.
        const poolInfo: {
            shape: ShapePool;
            count: number;
            base: number;
        }[] = [];
        let totalCol = 0;
        for (const shape of SHAPE_POOLS) {
            const count = this.rebuildBodyOwners(shape.poolKey);
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
        const bodyContact = this.ensureBodyContactBuffer(bodyCount);
        const stepDt = time.stepDt;
        const accel = (this.world.findResource(GravityField.schema, GravityField)?.data
            .acceleration as readonly number[] | undefined) ?? [0, -9.81, 0, 0];
        for (let step = 0; step < steps; step++) {
            const base = step * perStep;
            this.fillSimParams(base, bodyCount, totalCol, stepDt, stepDt, accel, this.contactStamp);
            for (let k = 0; k < this.substeps; k++) {
                this.contactStamp++;
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

        this.ensurePredictKernel(bodiesBuf);
        this.ensureCommitKernel(bodiesBuf, bodyContact);
        this.ensureAccumulateKernel(contacts, counter, bodyContact);
        const predict = this.predictKernel;
        const commit = this.commitKernel;
        const accumulate = this.accumulateKernel;
        if (predict === null || commit === null || accumulate === null) return;

        for (let step = 0; step < steps; step++) {
            const stepOffset = [this.params.offset(step * perStep)];
            // Predict 1× por passo: vel += g·stepDt (gravidade integrada uma vez por passo).
            frame.compute('LCPFlow.predict', (pass) => {
                pass.bind
                    .setPipeline(predict.pipeline)
                    .setBindGroup(0, predict.bindGroup, stepOffset);
                pass.dispatch.invocations(bodyCount, 64);
            });

            if (totalCol > 0) {
                // Substeps refinam detecção de contato + solve — predict e commit ficam fora.
                for (let k = 0; k < this.substeps; k++) {
                    const subOffset = [this.params.offset(step * perStep + 1 + k)];
                    // Lista compactada recomeça a cada substep (no fluxo de comandos — research A1).
                    frame.clear(counter);

                    // Fase 1 — DetectContacts (uma variante por pool não vazio)
                    for (const info of poolInfo) {
                        if (info.count === 0) continue;
                        const kernel = this.ensureNarrowphaseKernel(
                            info.shape,
                            bodiesBuf,
                            contacts,
                            counter,
                            warm,
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
                    this.ensureBuildLcpKernel(bodiesBuf, contacts, bVec, counter);
                    const build = this.buildLcpKernel;
                    if (build === null) continue;
                    frame.compute('LCPFlow.buildLcp', (pass) => {
                        pass.bind
                            .setPipeline(build.pipeline)
                            .setBindGroup(0, build.bindGroup, subOffset);
                        pass.dispatch.invocations(this.contactsCapacity, 64);
                    });

                    // Fase 3 — SolvePGS×K (single-threaded)
                    this.ensureSolveLcpKernel(bodiesBuf, contacts, bVec, counter, warm);
                    const solve = this.solveLcpKernel;
                    if (solve === null) continue;
                    frame.compute('LCPFlow.solveLcp', (pass) => {
                        pass.bind
                            .setPipeline(solve.pipeline)
                            .setBindGroup(0, solve.bindGroup, subOffset);
                        pass.dispatch.workgroups(1);
                    });
                }
            }

            // Correção posicional por corpo a partir dos contatos do último substep.
            frame.clear(bodyContact);
            if (totalCol > 0) {
                frame.compute('LCPFlow.accumulate', (pass) => {
                    pass.bind
                        .setPipeline(accumulate.pipeline)
                        .setBindGroup(0, accumulate.bindGroup, stepOffset);
                    pass.dispatch.workgroups(1);
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
        bodiesBuf: StorageBufferSpec,
        bodyCount: number,
        counter: StorageBufferSpec,
    ): void {
        if (this.readbackInFlight) return;
        const byteSize = bodyCount * LCP_BODY_STRIDE_F32 * 4;
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
            byteSize: RB_CONTACT_COUNTER_BYTE_SIZE,
        }));
        frame.copy(counter, counterStaging, RB_CONTACT_COUNTER_BYTE_SIZE);
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
        const [count = 0, overflow = 0] = new Uint32Array(counter);
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
        for (let slot = 0; slot < total; slot++) {
            const eid = this.resources.poolEntityBySlot(this.bodiesPoolKey, slot);
            if (eid === undefined) continue;
            const base = slot * LCP_BODY_STRIDE_F32;
            if (base + 16 > view.length) continue;
            const transform = this.world.resourcesOf(eid).find((r) => r instanceof Transform);
            if (transform === undefined) continue;
            const rx = view[base + 12] ?? 0;
            const ry = view[base + 13] ?? 0;
            const rz = view[base + 14] ?? 0;
            const rw = view[base + 15] ?? 1;
            const len = Math.hypot(rx, ry, rz, rw);
            transform.data.position = [
                view[base] ?? 0,
                view[base + 1] ?? 0,
                view[base + 2] ?? 0,
                1,
            ];
            transform.data.rotation =
                len > 1e-6 ? [rx / len, ry / len, rz / len, rw / len] : [0, 0, 0, 1];
        }
    }
}
