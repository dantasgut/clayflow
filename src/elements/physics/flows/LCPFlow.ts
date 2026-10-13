import type {
    EngineCore,
    Frame,
    StagingBufferSpec,
    StorageBufferSpec,
    UniformBufferSpec,
} from '../../../scene/contracts/gpu';
import type { PipelineDescriptor } from '../../../scene/descriptors/PipelineDescriptor';
import { Flow } from '../../../scene/flows/Flow';
import type {
    BindingSources,
    BoundFlow,
    PreparedCompute,
    TransitionContext,
} from '../../../scene/flows/FlowBinding';
import type { FlowContext } from '../../../scene/flows/FlowRegistry';
import type { FlowEvent, FlowTransitions } from '../../../scene/flows/FlowTransitions';
import {
    slot,
    type BodiesSlot,
    type EntitiesSlot,
    type PoolsSlot,
    type SingletonSlot,
    type SlotMap,
} from '../../../scene/flows/slots';
import { Time } from '../../../scene/time/Time';
import type { World } from '../../../scene/world/World';
import { AtomicAllocCounterSchema } from '../../gpu/compute/schemas';
import { Transform } from '../../scene/Transform';
import { RigidBody } from '../bodies/RigidBody';
import { LCPSchema } from '../bodies/schemas/LCPSchema';
import { Collider } from '../colliders/Collider';
import { COLLIDER_POOLS, ColliderSet } from '../colliders/ColliderSet';
import { GravityField } from '../forcefields/GravityField';
import { NarrowphaseParamsSchema, RBSimParamsSchema } from '../schemas/simParams';
import {
    RBBodyCorrectionSchema,
    RBBodyDeltaSchema,
    RBContactSchema,
    RBWarmEntrySchema,
} from '../schemas/simState';
import {
    rbBuildLcp,
    rbContactAccumulate,
    rbLcpCommit,
    rbNarrowphase,
    rbPredict,
    rbPublishPose,
    rbSolveLcp,
} from '../shaders/lcp';
import { PosePublishParamsSchema, RigidPoseInstanceSchema, rigidPoseRecord } from '../schemas/pose';
import { PerStepUniforms } from './PerStepUniforms';

/** Contatos por par no máximo: manifold de cantos de uma caixa. */
const RB_MAX_CONTACTS_PER_PAIR = 8;
/** Contatos por corpo na capacidade padrão da lista compactada (research R19). */
const DEFAULT_MAX_CONTACTS_PER_BODY = 32;
/** Passos de física entre duas leituras do contador de excedente de contatos (diagnóstico, sem bloquear). */
const OVERFLOW_CHECK_STEPS = 60;

interface ShapePool {
    readonly poolKey: string;
    /** Id do pipeline de narrowphase da forma. */
    readonly pipeline: string;
    readonly entryPoint: string;
}

const SHAPE_POOLS: readonly ShapePool[] = [
    {
        poolKey: 'PlaneCollider',
        pipeline: 'lcp_narrowphase_plane',
        entryPoint: 'rb_narrowphase_plane_main',
    },
    {
        poolKey: 'BoxCollider',
        pipeline: 'lcp_narrowphase_box',
        entryPoint: 'rb_narrowphase_box_main',
    },
    {
        poolKey: 'SphereCollider',
        pipeline: 'lcp_narrowphase_sphere',
        entryPoint: 'rb_narrowphase_sphere_main',
    },
    {
        poolKey: 'MeshCollider',
        pipeline: 'lcp_narrowphase_mesh',
        entryPoint: 'rb_narrowphase_mesh_main',
    },
];

/** Variável do pool de cada forma na narrowphase. */
const SHAPE_VARIABLE: Readonly<Record<string, string>> = {
    PlaneCollider: 'planes',
    BoxCollider: 'boxes',
    SphereCollider: 'spheres',
    MeshCollider: 'meshes',
};

/** Opções do `LCPFlow`. */
export interface LCPFlowOptions {
    /** Substeps de detecção + solve por passo de física (padrão 4). O passo vem do `Time` da cena. */
    readonly substeps?: number;
    /** Iterações do solve (Jacobi com divisão de massa) por substep (padrão 8). */
    readonly solveIters?: number;
    /**
     * Contatos por corpo na capacidade da lista compactada (padrão 32; uma caixa apoiada gera um contato por canto).
     * Capacidade = `min(corpos × colliders × 8, corpos × maxContactsPerBody, limite de binding do device / 96)`;
     * contatos acima dela são contados e avisados.
     */
    readonly maxContactsPerBody?: number;
}

/** Slots do LCP. */
export interface LCPSlots extends SlotMap {
    /** Pool de corpos do `bodyType` do registro. */
    readonly bodies: BodiesSlot;
    /** Relógio da cena (passos fixos do quadro). */
    readonly time: SingletonSlot<false>;
    /** Campo de gravidade (opcional; padrão `[0, −9,81, 0]`). */
    readonly gravity: SingletonSlot<true>;
    /** Pools de colliders e de corpos rígidos (cada um presente ou não). */
    readonly colliderPools: PoolsSlot;
    /** Entidades com collider (donos dos registros nos pools de collider). */
    readonly colliders: EntitiesSlot;
    /**
     * Corpos com `Transform`: registro `RigidPose` (slot do corpo e do `Transform`), lista dos vivos e posse da GPU
     * sobre o `Transform` — a pose é publicada na GPU (spec 007).
     */
    readonly poses: EntitiesSlot;
}

function slotsOf(bodiesPoolKey: string): LCPSlots {
    return {
        bodies: slot.bodies(),
        time: slot.singleton(Time.schema),
        gravity: slot.singleton(GravityField.schema, { optional: true }),
        colliderPools: slot.pools([...COLLIDER_POOLS.map((s) => s.name), bodiesPoolKey]),
        colliders: slot.entities({ all: [Collider] }),
        poses: POSES_SLOT,
    };
}

/** O mesmo conjunto (e dono) em todas as instâncias: registro, lista e posse são da cena, não da instância. */
const POSES_SLOT = slot.entities({
    all: [RigidBody, Transform],
    record: rigidPoseRecord,
    groups: { schema: RigidPoseInstanceSchema, key: () => 'poses', instance: 'record' },
    owns: [[Transform, 'transform']],
});

type Ctx = TransitionContext<LCPSlots>;

/** Contagens do quadro decididas em `framePrepare`. */
interface FrameWork {
    readonly steps: number;
    readonly bodyCount: number;
    readonly totalCol: number;
    readonly poolCounts: ReadonlyMap<string, number>;
    readonly stamps: readonly number[];
}

/**
 * LCPFlow — solver de RigidBody via LCP (Linear Complementarity Problem) com 4 fases canônicas: DetectContacts →
 * AssembleA → SolvePGS×K → Apply. O quadro executa `time.steps` passos de `time.stepDt`; cada passo faz predict,
 * `substeps` iterações de detecção + solve e commit, cada iteração com a sua região de parâmetros
 * (`PerStepUniforms`, offset dinâmico). Etapas:
 *
 *   1. `rb_predict`        — integra gravidade + damping em `pos_pred`/`rot_pred`/`vel`
 *   2. narrowphase × N     — uma variante por pool de Collider (Plane/Box/Sphere/Mesh)
 *   3. `rb_build_lcp`      — preenche bias `b_vec` + diagonais Delassus por contato (massas divididas)
 *   4. `rb_solve_lcp`      — warm start + K iterações Jacobi com divisão de massa, paralelas por contato e por
 *                            corpo (research R19)
 *   5. `rb_contact_accumulate` + `rb_lcp_commit` — correção posicional por corpo; velocidades e pose
 *
 * Modelo de slots: o pool de corpos, o `Time`, o `GravityField` (opcional), os pools de collider e as entidades com
 * collider. Recursos privados — parâmetros por iteração, lista de contatos e tabela de warm start (pela capacidade),
 * buffers por corpo, parâmetros de narrowphase por forma e o `ColliderSet` — são recriados e religados em transições
 * (`framePrepare`, pools realocados, colliders), nunca no `dispatch`.
 *
 * Ao fim do quadro, `rb_publish_pose` copia na GPU a pose (posição e rotação normalizada) de cada corpo para o
 * `Transform` da entidade (registro `RigidPose` mantido pela C2; o `Transform` é de posse da GPU), e o estágio de
 * transformação compõe a matriz no mesmo quadro — nenhuma leitura de volta (spec 007). A escala do `Transform` é do
 * desenvolvedor e não é tocada. Quem precisa da pose na CPU usa a leitura sob demanda da C2. O contador de excedente
 * de contatos é lido a cada `OVERFLOW_CHECK_STEPS` passos, sem bloquear.
 */
export class LCPFlow extends Flow<LCPSlots, 'running'> {
    readonly type = 'LCPFlow';
    readonly slots: LCPSlots;
    override readonly pipelines: readonly PipelineDescriptor[];
    override readonly bindings: BindingSources;
    protected readonly initialState = 'running' as const;
    protected readonly transitions: FlowTransitions<'running', TransitionContext<LCPSlots>>;

    private readonly core: EngineCore;
    private readonly world: World;
    private readonly bodiesPoolKey: string;
    private readonly substeps: number;
    private readonly solveIters: number;
    private readonly maxContactsPerBody: number;

    /** Região por passo (predict/commit) + uma por substep, ligadas por offset dinâmico. */
    private readonly params: PerStepUniforms;
    private readonly colliderSet: ColliderSet;
    private readonly npParams = new Map<string, UniformBufferSpec>();
    /** Contador `{ count, overflow }` da lista compactada — zerado antes de cada substep. */
    private readonly counter: StorageBufferSpec;
    private contacts: StorageBufferSpec | null = null;
    private bVec: StorageBufferSpec | null = null;
    /** Tabela de warm start por par (hash) e a sua capacidade (potência de 2). */
    private warm: StorageBufferSpec | null = null;
    private contactsCapacity = 0;
    private warmCapacity = 0;
    /** Pool de corpos ou de collider recriado: contatos refeitos do zero no próximo `framePrepare`. */
    private contactsStale = false;
    /** Correção posicional, Δv/Δω do solve e contatos por corpo no substep, pela capacidade de corpos. */
    private bodyCorrection: StorageBufferSpec | null = null;
    private bodyDelta: StorageBufferSpec | null = null;
    private bodySplit: StorageBufferSpec | null = null;
    private bodyCapacity = 0;
    /** Carimbo do substep corrente (warm start lê entradas do substep anterior). */
    private contactStamp = 0;
    private work: FrameWork | null = null;

    private readonly counterStaging: StagingBufferSpec;
    /** Parâmetros da publicação da pose (início e tamanho da lista de registros vivos). */
    private readonly publishParams: UniformBufferSpec;
    /** Registros vivos a publicar neste quadro (0 = nada). */
    private publishCount = 0;
    /** Passos desde a última leitura do contador; a cópia do contador é gravada no quadro em que vence. */
    private stepsSinceOverflowCheck = 0;
    private overflowCopyPending = false;
    private overflowReadInFlight = false;
    private overflowWarned = false;
    /** Último `first:count` escrito nos parâmetros da publicação. */
    private writtenPublish = '';

    constructor(ctx: FlowContext, options: LCPFlowOptions = {}) {
        super();
        this.core = ctx.core;
        this.world = ctx.world;
        this.bodiesPoolKey = ctx.bodyType ?? LCPSchema.name;
        this.substeps = Math.max(1, options.substeps ?? 4);
        this.solveIters = Math.max(1, options.solveIters ?? 8);
        this.maxContactsPerBody = Math.max(
            1,
            options.maxContactsPerBody ?? DEFAULT_MAX_CONTACTS_PER_BODY,
        );
        this.slots = slotsOf(this.bodiesPoolKey);
        this.params = new PerStepUniforms(ctx.core, {
            discriminator: 'lcp_sim_params',
            schema: RBSimParamsSchema,
        });
        this.params.reserve(this.substeps + 1);
        this.colliderSet = new ColliderSet(ctx.core, ctx.world, ctx.resources, {
            discriminator: 'lcp_colliders',
            bodiesPoolKey: this.bodiesPoolKey,
        });
        this.counter = ctx.core.create<StorageBufferSpec>({
            kind: 'buffer',
            subkind: 'storage',
            discriminator: 'lcp_contact_counter',
            byteSize: AtomicAllocCounterSchema.stride,
        });
        this.counterStaging = ctx.core.create<StagingBufferSpec>({
            kind: 'buffer',
            subkind: 'staging',
            discriminator: 'lcp_contact_counter_staging',
            byteSize: AtomicAllocCounterSchema.stride,
        });
        this.publishParams = ctx.core.create<UniformBufferSpec>({
            kind: 'buffer',
            subkind: 'uniform',
            discriminator: 'lcp_publish_params',
            byteSize: PosePublishParamsSchema.stride,
        });
        const privates: Record<
            string,
            StorageBufferSpec | UniformBufferSpec | ReturnType<PerStepUniforms['source']>
        > = {
            rb_params: this.params.source(),
            contact_counter: this.counter,
            publish: this.publishParams,
        };
        for (const shape of SHAPE_POOLS) {
            const np = ctx.core.create<UniformBufferSpec>({
                kind: 'buffer',
                subkind: 'uniform',
                discriminator: `lcp_np_params_${shape.poolKey}`,
                byteSize: NarrowphaseParamsSchema.stride,
            });
            this.npParams.set(shape.poolKey, np);
            privates[`${shape.pipeline}:np_params`] = np;
        }
        this.ensureContacts(1, 1);
        this.ensureBodyBuffers(1);
        this.bindings = { ...privates, ...this.contactSources(), ...this.bodySources() };
        const consumes = [this.bodiesPoolKey];
        const compute = (
            id: string,
            shader: PipelineDescriptor['shader'],
            entry: string,
        ): PipelineDescriptor => ({
            id,
            role: 'compute',
            shader,
            entryPoints: [entry],
            consumes,
        });
        this.pipelines = [
            compute('lcp_predict', rbPredict, 'rb_predict_main'),
            compute('lcp_gravity', rbPredict, 'rb_apply_gravity_main'),
            ...SHAPE_POOLS.map((s) => compute(s.pipeline, rbNarrowphase, s.entryPoint)),
            compute('lcp_build', rbBuildLcp, 'rb_build_lcp'),
            compute('lcp_warm_apply', rbSolveLcp, 'rb_warm_apply_main'),
            compute('lcp_solve_contacts', rbSolveLcp, 'rb_solve_contacts_main'),
            compute('lcp_apply_delta', rbSolveLcp, 'rb_apply_body_delta_main'),
            compute('lcp_warm_store', rbSolveLcp, 'rb_warm_store_main'),
            compute('lcp_accumulate', rbContactAccumulate, 'rb_contact_accumulate_main'),
            compute('lcp_commit', rbLcpCommit, 'rb_lcp_commit_main'),
            {
                id: 'lcp_publish_pose',
                role: 'compute',
                shader: rbPublishPose,
                entryPoints: ['rb_publish_pose_main'],
                consumes: [
                    this.bodiesPoolKey,
                    rigidPoseRecord.schema.name,
                    RigidPoseInstanceSchema.name,
                    Transform.schema.name,
                ],
            },
        ];
        const colliders = {
            to: 'running' as const,
            run: (_e: unknown, c: Ctx) => {
                this.refreshColliders(c);
            },
        };
        this.transitions = {
            '*': {
                slotsResolved: colliders,
                slotChanged: colliders,
                // Entidades com collider entram/saem em massa: só marca; a reconstrução é uma por quadro (framePrepare).
                entitiesChanged: {
                    to: 'running',
                    run: () => {
                        this.colliderSet.markDirty();
                    },
                },
                poolReallocated: {
                    to: 'running',
                    run: (e, c) => {
                        this.onPoolReallocated(e, c);
                    },
                },
                slotLost: 'ignore',
                pipelinesCompiled: 'ignore',
                bindGroupReplaced: 'ignore',
                framePrepare: {
                    to: 'running',
                    run: (_e, c) => {
                        this.syncColliders(c);
                        this.prepareFrame(c);
                    },
                },
                frameRecorded: {
                    to: 'running',
                    run: () => {
                        this.readOverflowCounter();
                    },
                },
            },
        };
    }

    /**
     * Lista compactada de contatos do último substep gravado e o seu contador `{ count, overflow }` (diagnóstico:
     * smokes leem o conjunto de contatos para compará-lo entre versões da narrowphase). `contacts` é `null` até o
     * primeiro quadro com corpos.
     */
    contactBuffers(): {
        readonly contacts: StorageBufferSpec | null;
        readonly counter: StorageBufferSpec;
        readonly capacity: number;
        /** Bytes por contato (stride do struct `RBContact`). */
        readonly recordBytes: number;
    } {
        return {
            contacts: this.contacts,
            counter: this.counter,
            capacity: this.contactsCapacity,
            recordBytes: RBContactSchema.stride,
        };
    }

    /**
     * Capacidade da lista compactada de contatos (research R19): no máximo 8 contatos por par (cantos),
     * `maxContactsPerBody` por corpo e o que cabe num binding de storage do device.
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

    /** Grava os passos do quadro (contagens, carimbos e capacidades decididos em `framePrepare`). */
    dispatch(frame: Frame, bound: BoundFlow<LCPSlots>): void {
        const work = this.work;
        if (work === null || work.steps === 0 || work.bodyCount === 0) return;
        const { bodyCount, totalCol } = work;
        const perStep = this.substeps + 1;
        const predict = bound.compute('lcp_predict');
        const gravity = bound.compute('lcp_gravity');
        const build = bound.compute('lcp_build');
        const warmApply = bound.compute('lcp_warm_apply');
        const solveContacts = bound.compute('lcp_solve_contacts');
        const applyDelta = bound.compute('lcp_apply_delta');
        const warmStore = bound.compute('lcp_warm_store');
        const accumulate = bound.compute('lcp_accumulate');
        const commit = bound.compute('lcp_commit');
        const run = (
            label: string,
            p: PreparedCompute,
            offset: number[],
            invocations: number,
        ): void => {
            frame.compute(label, (pass) => {
                pass.bind.setPipeline(p.spec);
                p.groups.forEach((bg, g) =>
                    pass.bind.setBindGroup(g, bg, p.dynamic[g] ? offset : undefined),
                );
                pass.dispatch.invocations(invocations, 64);
            });
        };
        const warmRegionBytes = this.warmCapacity * RBWarmEntrySchema.stride;
        for (let step = 0; step < work.steps; step++) {
            const stepOffset = [this.params.offset(step * perStep)];
            // Predict 1× por passo: damping, giroscópico e pose predita.
            run('LCPFlow.predict', predict, stepOffset, bodyCount);
            // Substeps: gravidade (g · dtSub), detecção de contato e solve — predict e commit ficam fora.
            for (let k = 0; k < this.substeps; k++) {
                const subOffset = [this.params.offset(step * perStep + 1 + k)];
                run('LCPFlow.gravity', gravity, subOffset, bodyCount);
                if (totalCol === 0) continue;
                // Lista compactada, contatos por corpo e somas do solve recomeçam a cada substep; a região da
                // tabela de warm start que este substep grava é zerada (no fluxo de comandos).
                const stamp = work.stamps[step * this.substeps + k] ?? 0;
                frame.clear(this.counter);
                frame.clear(this.bodySplit!);
                frame.clear(this.bodyDelta!);
                frame.clear(this.warm!, (stamp & 1) * warmRegionBytes, warmRegionBytes);
                // Fase 1 — DetectContacts (uma variante por pool não vazio)
                for (const shape of SHAPE_POOLS) {
                    const count = work.poolCounts.get(shape.poolKey) ?? 0;
                    if (count === 0) continue;
                    run(
                        `LCPFlow.narrowphase.${shape.poolKey}`,
                        bound.compute(shape.pipeline),
                        subOffset,
                        bodyCount * count,
                    );
                }
                // Fase 2 — AssembleA
                run('LCPFlow.buildLcp', build, subOffset, this.contactsCapacity);
                // Fase 3 — warm start + K iterações Jacobi (contatos em paralelo, depois corpos em paralelo)
                run('LCPFlow.warmApply', warmApply, subOffset, this.contactsCapacity);
                run('LCPFlow.applyDelta', applyDelta, subOffset, bodyCount);
                for (let it = 0; it < this.solveIters; it++) {
                    run('LCPFlow.solveContacts', solveContacts, subOffset, this.contactsCapacity);
                    run('LCPFlow.applyDelta', applyDelta, subOffset, bodyCount);
                }
                run('LCPFlow.warmStore', warmStore, subOffset, this.contactsCapacity);
            }
            // Correção posicional por corpo a partir dos contatos do último substep.
            frame.clear(this.bodyCorrection!);
            if (totalCol > 0)
                run('LCPFlow.accumulate', accumulate, stepOffset, this.contactsCapacity);
            // Commit 1× por passo: pos += vel·stepDt + correção posicional.
            run('LCPFlow.commit', commit, stepOffset, bodyCount);
        }
        // Pose de cada corpo vivo no seu Transform, na GPU (a composição da matriz vem depois, na fase transform).
        if (this.publishCount > 0)
            run('LCPFlow.publishPose', bound.compute('lcp_publish_pose'), [], this.publishCount);
        // Diagnóstico amostrado: o contador do último substep, a cada OVERFLOW_CHECK_STEPS passos.
        if (this.overflowCopyPending)
            frame.copy(this.counter, this.counterStaging, AtomicAllocCounterSchema.stride);
    }

    /** Libera parâmetros, contatos, buffers por corpo, staging e o conjunto de colliders. */
    override dispose(): void {
        this.params.dispose();
        this.releaseContacts();
        for (const spec of [this.bodyCorrection, this.bodyDelta, this.bodySplit]) {
            if (spec !== null) this.core.destroy(spec);
        }
        this.core.destroy(this.counter);
        this.core.destroy(this.counterStaging);
        this.core.destroy(this.publishParams);
        for (const buf of this.npParams.values()) this.core.destroy(buf);
        this.npParams.clear();
        this.colliderSet.destroy();
    }

    /** Mapas de dono e contagens dos colliders; religa os pools e os mapas de cada narrowphase quando mudam. */
    private refreshColliders(ctx: Ctx): void {
        this.colliderSet.markDirty();
        this.syncColliders(ctx);
    }

    /** Reconstrói os mapas de dono se sujos e religa as fontes que mudaram. */
    private syncColliders(ctx: Ctx): void {
        if (!this.colliderSet.refresh()) return;
        const sources: Record<string, StorageBufferSpec | UniformBufferSpec> = {};
        for (const shape of SHAPE_POOLS) {
            const pool = this.colliderSet.pool(shape.poolKey);
            sources[SHAPE_VARIABLE[shape.poolKey]!] = pool.buffer;
            sources[`${shape.pipeline}:body_owners`] = pool.owners;
        }
        ctx.bind(sources);
    }

    /**
     * Pool de corpos ou de collider recriado: contatos refeitos do zero no próximo `framePrepare` (os atuais seguem
     * ligados até lá); mapas de dono e pools da narrowphase religados.
     */
    private onPoolReallocated(event: FlowEvent, ctx: Ctx): void {
        if (event.type !== 'poolReallocated') return;
        if (
            event.poolKey === this.bodiesPoolKey
            || SHAPE_POOLS.some((s) => s.poolKey === event.poolKey)
        ) {
            this.contactsStale = true;
        }
        this.refreshColliders(ctx);
    }

    private contactSources(): BindingSources {
        return { contacts: this.contacts!, b_vec: this.bVec!, warm_table: this.warm! };
    }

    private bodySources(): BindingSources {
        return {
            body_correction: this.bodyCorrection!,
            body_delta: this.bodyDelta!,
            body_split: this.bodySplit!,
        };
    }

    /** Lista compactada de contatos, bias e tabela de warm start para a capacidade; devolve se recriou. */
    private ensureContacts(bodyCount: number, totalCol: number): boolean {
        const capacity = this.contactCapacity(bodyCount, totalCol);
        if (this.contacts !== null && this.contactsCapacity === capacity && !this.contactsStale)
            return false;
        this.contactsStale = false;
        this.releaseContacts();
        this.contactsCapacity = capacity;
        const storage = (discriminator: string, byteSize: number): StorageBufferSpec =>
            this.core.create<StorageBufferSpec>({
                kind: 'buffer',
                subkind: 'storage',
                discriminator,
                byteSize,
            });
        this.contacts = storage(`lcp_contacts_${capacity}`, capacity * RBContactSchema.stride);
        this.bVec = storage(`lcp_bvec_${capacity}`, Math.max(16, capacity * 4));
        let warmCapacity = 1;
        while (warmCapacity < capacity * 2) warmCapacity *= 2;
        this.warmCapacity = warmCapacity;
        this.warm = storage(
            `lcp_warm_${warmCapacity}`,
            2 * warmCapacity * RBWarmEntrySchema.stride,
        );
        return true;
    }

    /** Destrói lista de contatos, bias e tabela de warm start. */
    private releaseContacts(): void {
        for (const spec of [this.contacts, this.bVec, this.warm])
            if (spec !== null) this.core.destroy(spec);
        this.contacts = null;
        this.bVec = null;
        this.warm = null;
        this.contactsCapacity = 0;
        this.warmCapacity = 0;
    }

    /** Buffers por corpo, crescendo em potências de 2; devolve se recriou. */
    private ensureBodyBuffers(bodyCount: number): boolean {
        if (this.bodyCorrection !== null && this.bodyCapacity >= bodyCount) return false;
        for (const spec of [this.bodyCorrection, this.bodyDelta, this.bodySplit]) {
            if (spec !== null) this.core.destroy(spec);
        }
        let capacity = Math.max(16, this.bodyCapacity);
        while (capacity < bodyCount) capacity *= 2;
        this.bodyCapacity = capacity;
        const storage = (name: string, byteSize: number): StorageBufferSpec =>
            this.core.create<StorageBufferSpec>({
                kind: 'buffer',
                subkind: 'storage',
                discriminator: `${name}_${capacity}`,
                byteSize,
            });
        this.bodyCorrection = storage('lcp_body_contact', capacity * RBBodyCorrectionSchema.stride);
        this.bodyDelta = storage('lcp_body_delta', capacity * RBBodyDeltaSchema.stride);
        this.bodySplit = storage('lcp_body_split', capacity * 4);
        return true;
    }

    /**
     * Antes da gravação: contagens dos pools, parâmetros de narrowphase, capacidades (contatos, warm start, buffers
     * por corpo — recriados e religados aqui), regiões de `RBSimParams` com os carimbos dos substeps, a lista de
     * poses a publicar e, a cada `OVERFLOW_CHECK_STEPS` passos, a cópia do contador de excedente.
     */
    private prepareFrame(ctx: Ctx): void {
        const bound = ctx.bound;
        const time = bound.slots.time.resource as Time;
        const steps = time.steps;
        const bodyCount = bound.slots.bodies.count;
        this.overflowCopyPending = false;
        this.publishCount = 0;
        if (steps === 0 || bodyCount === 0) {
            this.work = { steps: 0, bodyCount, totalCol: 0, poolCounts: new Map(), stamps: [] };
            return;
        }
        // Contagens por pool; offsets cumulativos dos pools na linha de contatos do corpo.
        const poolCounts = new Map<string, number>();
        let totalCol = 0;
        const bases = new Map<string, number>();
        for (const shape of SHAPE_POOLS) {
            const count = this.colliderSet.pool(shape.poolKey).count;
            poolCounts.set(shape.poolKey, count);
            bases.set(shape.poolKey, totalCol);
            totalCol += count;
        }
        for (const shape of SHAPE_POOLS) {
            const count = poolCounts.get(shape.poolKey) ?? 0;
            if (count === 0) continue;
            this.core.write(
                this.npParams.get(shape.poolKey)!,
                NarrowphaseParamsSchema.pack({
                    pool_count: count,
                    pool_base: bases.get(shape.poolKey) ?? 0,
                    total_col_count: totalCol,
                }),
            );
        }
        // Regiões: por passo, uma para predict/commit (dt do passo) e uma por substep.
        const perStep = this.substeps + 1;
        const regions = steps * perStep;
        if (this.params.reserve(regions)) ctx.bind({ rb_params: this.params.source() });
        // Buffers antes dos parâmetros: a capacidade da lista e da tabela entram em cada região.
        if (this.ensureContacts(bodyCount, totalCol)) ctx.bind(this.contactSources());
        if (this.ensureBodyBuffers(bodyCount)) ctx.bind(this.bodySources());
        const stepDt = time.stepDt;
        const accel = (bound.slots.gravity?.resource.data.acceleration as
            | readonly number[]
            | undefined) ?? [0, -9.81, 0, 0];
        // Carimbo de cada substep: a paridade escolhe a região da tabela de warm start que ele grava.
        const stamps: number[] = [];
        for (let step = 0; step < steps; step++) {
            const base = step * perStep;
            this.writeParams(base, bodyCount, totalCol, stepDt, stepDt, accel, this.contactStamp);
            for (let k = 0; k < this.substeps; k++) {
                this.contactStamp++;
                stamps.push(this.contactStamp);
                this.writeParams(
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
        this.work = { steps, bodyCount, totalCol, poolCounts, stamps };
        this.preparePublish(bound);
        this.stepsSinceOverflowCheck += steps;
        if (this.stepsSinceOverflowCheck >= OVERFLOW_CHECK_STEPS && !this.overflowReadInFlight) {
            this.stepsSinceOverflowCheck = 0;
            this.overflowCopyPending = totalCol > 0;
        }
    }

    /** Início e tamanho da lista de poses (o grupo único do slot `poses`), escritos quando mudam. */
    private preparePublish(bound: BoundFlow<LCPSlots>): void {
        const list = bound.slots.poses.groups[0];
        this.publishCount = list?.count ?? 0;
        if (list === undefined) return;
        const key = `${list.first}:${list.count}`;
        if (key === this.writtenPublish) return;
        this.core.write(
            this.publishParams,
            PosePublishParamsSchema.pack({ first: list.first, count: list.count }),
        );
        this.writtenPublish = key;
    }

    /**
     * Preenche a região `region` de `RBSimParams`: `gravity.w` = dt da iteração (passo inteiro em predict/commit,
     * `stepDt / substeps` nos substeps), `dt_frame` = `stepDt`, capacidades e carimbo do substep.
     */
    private writeParams(
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

    /** Quadro enviado: se a cópia do contador foi gravada, lê-o de volta (sem bloquear o quadro). */
    private readOverflowCounter(): void {
        if (!this.overflowCopyPending) return;
        this.overflowCopyPending = false;
        this.overflowReadInFlight = true;
        // Defer ao próximo macrotask: o `submit` do quadro já rodou antes do `mapAsync`.
        setTimeout(() => {
            this.core
                .readback(this.counterStaging)
                .then((counter) => {
                    this.reportContactOverflow(counter);
                })
                .catch(() => {
                    /* device perdido ou cena descartada: a leitura é descartada */
                })
                .finally(() => {
                    this.overflowReadInFlight = false;
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
}
