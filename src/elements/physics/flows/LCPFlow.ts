import type {
    EngineCore,
    Frame,
    IndirectBufferSpec,
    StorageBufferSpec,
    UniformBufferSpec,
} from '../../../scene/contracts/gpu';
import type { ResourceDirectory } from '../../../scene/contracts/ResourceDirectory';
import type { GPUDescriptor } from '../../../scene/descriptors/GPUDescriptor';
import type { PipelineDescriptor } from '../../../scene/descriptors/PipelineDescriptor';
import { StructSchema } from '../../../scene/descriptors/StructSchema';
import { Flow } from '../../../scene/flows/Flow';
import { FlowWork, type WorkContext } from '../../../scene/flows/FlowWork';
import type {
    BindingKey,
    BindingSource,
    BoundFlow,
    PreparedCompute,
    TransitionContext,
} from '../../../scene/flows/FlowBinding';
import type { WgslResource } from '../../../scene/shaders/WgslResource';
import { WORKGROUP_SIZE } from '../../../scene/shaders/engineConstants';
import type { FlowContext } from '../../../scene/flows/FlowRegistry';
import type { FlowEvent, FlowTransitions } from '../../../scene/flows/FlowTransitions';
import {
    slot,
    type BodiesSlot,
    type EntitiesSlot,
    type PoolsSlot,
    type SingletonSlot,
    type SlotMap,
    type WorkSlot,
} from '../../../scene/flows/slots';
import { Time } from '../../../scene/time/Time';
import type { World } from '../../../scene/world/World';
import { AtomicAllocCounterSchema, wordBuffer } from '../../gpu/compute/schemas';
import { SpatialHashGrid } from '../../gpu/compute/SpatialHashGrid';
import {
    BroadphaseParamsSchema,
    CandidatePairCountsSchema,
    CandidatePairSchema,
    NarrowphaseDispatchSchema,
} from '../schemas/broadphase';
import { hashGridResources } from '../../gpu/compute/shaders';
import { Transform } from '../../scene/Transform';
import { RigidBody } from '../bodies/RigidBody';
import { LCPSchema } from '../bodies/schemas/LCPSchema';
import { Collider } from '../colliders/Collider';
import { colliderResources } from '../colliders/colliderResources';
import { COLLIDER_POOL_KEYS, ColliderSet } from '../colliders/ColliderSet';
import { GravityField } from '../forcefields/GravityField';
import { NarrowphaseParamsSchema, RBSimParamsSchema } from '../schemas/simParams';
import {
    RBBodyCorrectionSchema,
    RBBodyDeltaSchema,
    RBContactSchema,
    RBWarmEntrySchema,
} from '../schemas/simState';
import {
    lcpResources as R,
    rbBroadphase,
    rbBuildLcp,
    rbContactAccumulate,
    rbLcpCommit,
    rbNarrowphase,
    rbPredict,
    rbPublishPose,
    rbSolveLcp,
} from '../shaders/lcp';
import { PosePublishParamsSchema, RigidPoseInstanceSchema, rigidPoseRecord } from '../schemas/pose';
import { PerStepUniforms } from '../../gpu/compute/PerStepUniforms';

/** Contatos por par no máximo: manifold de cantos de uma caixa. */
const RB_MAX_CONTACTS_PER_PAIR = 8;
/** Contatos por corpo na capacidade padrão da lista compactada (research R19). */
const DEFAULT_MAX_CONTACTS_PER_BODY = 32;
/** Pares candidatos por corpo e por forma na capacidade padrão da broadphase (spec 007). */
const DEFAULT_MAX_PAIRS_PER_BODY = 64;
/** Fator da margem preditiva da broadphase (1: a velocidade é a do próprio substep). */
const BROADPHASE_MARGIN_SCALE = 1;
/** Folga absoluta da broadphase (m), contra arredondamento na fronteira do par. */
const BROADPHASE_SKIN = 1e-3;
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
    // Por último: a faixa das superfícies vem depois das existentes na linha de contatos (ids de par inalterados).
    {
        poolKey: 'SurfaceCollider',
        pipeline: 'lcp_narrowphase_surface',
        entryPoint: 'rb_narrowphase_surface_main',
    },
];

/** Recurso do pool de cada forma na narrowphase. */
const SHAPE_RESOURCE: Readonly<Record<string, WgslResource>> = {
    PlaneCollider: R.planes,
    BoxCollider: R.boxes,
    SphereCollider: R.spheres,
    MeshCollider: R.meshes,
    SurfaceCollider: R.surfaces,
};

/** Fontes de ligação do Flow: por recurso (todos os pipelines) ou por recurso num pipeline. */
type Sources = Map<BindingKey, BindingSource>;

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
    /**
     * Pares candidatos da broadphase por corpo e por forma (padrão 64): capacidade de cada lista = corpos ×
     * `maxPairsPerBody`; pares acima dela são contados e avisados (sem contato perdido em silêncio).
     */
    readonly maxPairsPerBody?: number;
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
    /**
     * O espaço de trabalho do solver (spec 039): parâmetros, contatos, warm start, buffers por corpo, broadphase, grade
     * hash e o `ColliderSet`.
     */
    readonly work: WorkSlot<LCPWork>;
}

/** Resource de trabalho do `LCPFlow` (spec 039). */
class LCPWork extends FlowWork {
    static readonly schema = new StructSchema('LCPWork', {});
}

function slotsOf(bodiesPoolKey: string, work: LCPWork): LCPSlots {
    return {
        bodies: slot.bodies(),
        time: slot.singleton(Time.schema),
        gravity: slot.singleton(GravityField.schema, { optional: true }),
        colliderPools: slot.pools([...COLLIDER_POOL_KEYS, bodiesPoolKey]),
        colliders: slot.entities({ all: [Collider] }),
        poses: POSES_SLOT,
        work: slot.work(() => work),
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
    /** Proxies da broadphase (caixas, esferas). */
    readonly boxCount: number;
    readonly sphereCount: number;
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
 * collider. O espaço de trabalho — parâmetros por iteração, lista de contatos e tabela de warm start (pela capacidade),
 * buffers por corpo, broadphase, parâmetros de narrowphase por forma e o `ColliderSet` — é do Resource de trabalho
 * (`LCPWork`, spec 039): redimensionado e religado em transições (`framePrepare`, pools realocados, colliders), nunca no
 * `dispatch`. Os proxies da broadphase (caixas seguidas das esferas, de dois pools de collider) ficam no trabalho pela
 * capacidade: não são de um pool só, então não cabem como descritor de uma entidade.
 *
 * Ao fim do quadro, `rb_publish_pose` copia na GPU a pose (posição e rotação normalizada) de cada corpo para o
 * `Transform` da entidade (registro `RigidPose` mantido pela C2; o `Transform` é de posse da GPU), e o estágio de
 * transformação compõe a matriz no mesmo quadro — nenhuma leitura de volta (spec 007). A escala do `Transform` é do
 * desenvolvedor e não é tocada. Quem precisa da pose na CPU usa a leitura sob demanda da C2. O contador de excedente
 * de contatos é lido a cada `OVERFLOW_CHECK_STEPS` passos pela leitura sob demanda da C2, sem bloquear.
 */
export class LCPFlow extends Flow<LCPSlots, 'running'> {
    readonly type = 'LCPFlow';
    readonly slots: LCPSlots;
    override readonly pipelines: readonly PipelineDescriptor[];
    protected readonly initialState = 'running' as const;
    protected readonly transitions: FlowTransitions<'running', TransitionContext<LCPSlots>>;

    private readonly core: EngineCore;
    private readonly resources: ResourceDirectory;
    private readonly lcpWork: WorkContext;
    private readonly world: World;
    private readonly bodiesPoolKey: string;
    private readonly substeps: number;
    private readonly solveIters: number;
    private readonly maxContactsPerBody: number;
    private readonly maxPairsPerBody: number;
    /** Broadphase: proxies, grade hash, pares por forma, contagens e argumentos indiretos (spec 007). */
    private readonly grid: SpatialHashGrid;
    private proxyCapacity = 0;
    private pairCapacity = 0;
    private writtenBroadphase = '';

    /** Região por passo (predict/commit) + uma por substep, ligadas por offset dinâmico. */
    private readonly params: PerStepUniforms;
    private readonly colliderSet: ColliderSet;
    private contactsCapacity = 0;
    /** Capacidade da tabela de warm start por par (hash; potência de 2). */
    private warmCapacity = 0;
    /** Pool de corpos ou de collider recriado: contatos refeitos do zero no próximo `framePrepare`. */
    private contactsStale = false;
    /** A tabela de warm start é zerada no próximo quadro gravado (os slots dos corpos mudaram). */
    private clearWarm = false;
    /** Capacidade dos buffers por corpo (correção posicional, Δv/Δω do solve, contatos por corpo no substep). */
    private bodyCapacity = 0;
    /** Carimbo do substep corrente (warm start lê entradas do substep anterior). */
    private contactStamp = 0;
    private work: FrameWork | null = null;

    /** Registros vivos a publicar neste quadro (0 = nada). */
    private publishCount = 0;
    /** Passos desde a última leitura do contador; a leitura sai no quadro em que vence. */
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
        this.maxPairsPerBody = Math.max(1, options.maxPairsPerBody ?? DEFAULT_MAX_PAIRS_PER_BODY);
        const work = new LCPWork();
        this.resources = ctx.resources;
        this.lcpWork = { core: ctx.core, resources: ctx.resources, work };
        this.slots = slotsOf(this.bodiesPoolKey, work);
        // Os buffers do solver pelas capacidades atuais (contatos, corpos, proxies, pares), os parâmetros e contadores.
        work.use({ descriptors: () => this.descriptors() });
        this.grid = new SpatialHashGrid(this.lcpWork, { discriminator: 'lcp_broadphase_grid' });
        this.params = new PerStepUniforms(this.lcpWork, {
            id: 'lcp_sim_params',
            schema: RBSimParamsSchema,
        });
        this.params.reserve(this.substeps + 1);
        this.colliderSet = new ColliderSet(this.lcpWork, ctx.world, {
            discriminator: 'lcp_colliders',
            bodiesPoolKey: this.bodiesPoolKey,
        });
        this.ensureContacts(1, 1);
        this.ensureBodyBuffers(1);
        this.ensureProxies(1);
        this.ensurePairs(1);
        const compute = (
            id: string,
            shader: PipelineDescriptor['shader'],
            entry: string,
        ): PipelineDescriptor => ({
            id,
            role: 'compute',
            shader,
            entryPoints: [entry],
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
            compute('lcp_bp_proxies_box', rbBroadphase, 'rb_proxies_box_main'),
            compute('lcp_bp_proxies_sphere', rbBroadphase, 'rb_proxies_sphere_main'),
            compute('lcp_bp_pairs', rbBroadphase, 'rb_candidate_pairs_main'),
            compute('lcp_bp_indirect', rbBroadphase, 'rb_pairs_indirect_main'),
            {
                id: 'lcp_publish_pose',
                role: 'compute',
                shader: rbPublishPose,
                entryPoints: ['rb_publish_pose_main'],
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
                // O trabalho já está na cena: as fontes privadas ligam ao que a C2 alocou.
                slotsResolved: {
                    to: 'running',
                    run: (_e, c) => {
                        this.grid.prepare(this.proxies, 0, 1);
                        c.bind(
                            new Map<BindingKey, BindingSource>([
                                ...this.privateSources(),
                                ...this.contactSources(),
                                ...this.bodySources(),
                                ...this.broadphaseSources(),
                                ...this.gridSources(),
                            ]),
                        );
                        this.refreshColliders(c);
                    },
                },
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
     * Lista compactada de contatos do último substep gravado, o seu contador `{ count, overflow }` e as contagens de
     * pares candidatos da broadphase (diagnóstico: smokes comparam o conjunto de contatos entre versões da narrowphase
     * e medem os pares testados). `contacts` é `null` até o
     * primeiro quadro com corpos.
     */
    /** Os descritores do solver no trabalho, pelas capacidades atuais (spec 039). */
    private descriptors(): GPUDescriptor[] {
        const uniform = (id: string, schema: StructSchema): GPUDescriptor => ({
            id,
            role: 'uniform',
            schema,
            upload: 'never',
        });
        const typed = (id: string, schema: StructSchema, count: number): GPUDescriptor => ({
            id,
            role: 'storage-rw',
            schema,
            upload: 'never',
            count,
        });
        const out: GPUDescriptor[] = [
            uniform('lcp_broadphase_params', BroadphaseParamsSchema),
            uniform('lcp_publish_params', PosePublishParamsSchema),
            ...SHAPE_POOLS.map((shape) =>
                uniform(npParamsId(shape.poolKey), NarrowphaseParamsSchema),
            ),
            {
                id: 'lcp_pair_counts',
                role: 'storage-rw',
                schema: CandidatePairCountsSchema,
                upload: 'never',
            },
            {
                id: 'lcp_contact_counter',
                role: 'storage-rw',
                schema: AtomicAllocCounterSchema,
                upload: 'never',
            },
            {
                id: 'lcp_np_args',
                role: 'indirect',
                schema: NarrowphaseDispatchSchema,
                upload: 'never',
            },
        ];
        if (this.contactsCapacity > 0)
            out.push(
                typed('lcp_contacts', RBContactSchema, this.contactsCapacity),
                wordBuffer('lcp_bvec', Math.max(16, this.contactsCapacity * 4)),
                typed('lcp_warm', RBWarmEntrySchema, 2 * this.warmCapacity),
            );
        if (this.bodyCapacity > 0)
            out.push(
                typed('lcp_body_contact', RBBodyCorrectionSchema, this.bodyCapacity),
                typed('lcp_body_delta', RBBodyDeltaSchema, this.bodyCapacity),
                wordBuffer('lcp_body_split', this.bodyCapacity * 4),
            );
        if (this.proxyCapacity > 0) out.push(wordBuffer('lcp_proxies', this.proxyCapacity * 16));
        if (this.pairCapacity > 0)
            out.push(
                typed('lcp_box_pairs', CandidatePairSchema, this.pairCapacity),
                typed('lcp_sphere_pairs', CandidatePairSchema, this.pairCapacity),
            );
        return out;
    }

    /** O buffer que a C2 alocou para o descritor `id` do trabalho. */
    private own<T>(id: string): T {
        return this.resources.bufferOf(this.lcpWork.work, id) as T;
    }

    private get bpParams(): UniformBufferSpec {
        return this.own('lcp_broadphase_params');
    }
    private get publishParams(): UniformBufferSpec {
        return this.own('lcp_publish_params');
    }
    /** Contagens de pares candidatos da broadphase (`CandidatePairCounts`). */
    private get pairCounts(): StorageBufferSpec {
        return this.own('lcp_pair_counts');
    }
    /** Contador `{ count, overflow }` da lista compactada — zerado antes de cada substep. */
    private get counter(): StorageBufferSpec {
        return this.own('lcp_contact_counter');
    }
    private get npArgs(): IndirectBufferSpec {
        return this.own('lcp_np_args');
    }
    private get contacts(): StorageBufferSpec {
        return this.own('lcp_contacts');
    }
    private get bVec(): StorageBufferSpec {
        return this.own('lcp_bvec');
    }
    /** Tabela de warm start por par (duas regiões, pela paridade do carimbo). */
    private get warm(): StorageBufferSpec {
        return this.own('lcp_warm');
    }
    private get bodyCorrection(): StorageBufferSpec {
        return this.own('lcp_body_contact');
    }
    private get bodyDelta(): StorageBufferSpec {
        return this.own('lcp_body_delta');
    }
    private get bodySplit(): StorageBufferSpec {
        return this.own('lcp_body_split');
    }
    private get proxies(): StorageBufferSpec {
        return this.own('lcp_proxies');
    }
    private get boxPairs(): StorageBufferSpec {
        return this.own('lcp_box_pairs');
    }
    private get spherePairs(): StorageBufferSpec {
        return this.own('lcp_sphere_pairs');
    }

    /** Fontes privadas fixas: parâmetros, contadores, publicação, broadphase e os parâmetros de narrowphase por forma. */
    private privateSources(): Sources {
        const sources: Sources = new Map<BindingKey, BindingSource>([
            [R.params, this.params.source()],
            [R.counterAlloc, this.counter],
            [R.counter, this.counter],
            [R.publish, this.publishParams],
            [R.bpParams, this.bpParams],
            [R.pairCounts, this.pairCounts],
            [R.pairCountsRead, this.pairCounts],
            [R.npArgs, { kind: 'buffer', buffer: this.npArgs }],
        ]);
        for (const shape of SHAPE_POOLS)
            sources.set(
                { pipeline: shape.pipeline, resource: R.npParams },
                this.own<UniformBufferSpec>(npParamsId(shape.poolKey)),
            );
        return sources;
    }

    contactBuffers(): {
        /** Contatos do último substep (`RBContact`), ou `null` antes da primeira alocação. */
        readonly contacts: StorageBufferSpec | null;
        /** Contador de contatos reservados (`AtomicAllocCounter`). */
        readonly counter: StorageBufferSpec;
        /** Contatos que cabem no buffer. */
        readonly capacity: number;
        /** Bytes por contato (stride do struct `RBContact`). */
        readonly recordBytes: number;
        /** Contagens de pares candidatos do último substep (`CandidatePairCounts`: caixas, esferas, excedente). */
        readonly pairCounts: StorageBufferSpec;
    } {
        return {
            contacts:
                (this.resources.bufferOf(this.lcpWork.work, 'lcp_contacts') as
                    | StorageBufferSpec
                    | undefined) ?? null,
            counter: this.counter,
            capacity: this.contactsCapacity,
            recordBytes: RBContactSchema.stride,
            pairCounts: this.pairCounts,
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
                p.bindTo(pass.bind, { draw: offset });
                pass.dispatch.invocations(invocations, WORKGROUP_SIZE.value);
            });
        };
        const runIndirect = (
            label: string,
            p: PreparedCompute,
            offset: number[],
            argsOffset: number,
        ): void => {
            frame.compute(label, (pass) => {
                pass.bind.setPipeline(p.spec);
                p.bindTo(pass.bind, { draw: offset });
                pass.dispatch.workgroupsIndirect(this.npArgs, argsOffset);
            });
        };
        const { boxCount, sphereCount } = work;
        const warmRegionBytes = this.warmCapacity * RBWarmEntrySchema.stride;
        // Slots dos corpos mudaram (pool realocado): o warm start recomeça do zero.
        if (this.clearWarm) {
            frame.clear(this.warm);
            this.clearWarm = false;
        }
        for (let step = 0; step < work.steps; step++) {
            const stepOffset = [this.params.offset(step * perStep)];
            // Predict 1× por passo: damping, giroscópico e pose predita.
            run('LCPFlow.predict', predict, stepOffset, bodyCount);
            // Broadphase: proxies e grade 1× por passo (a pose predita é a do passo inteiro); os pares, em cada substep.
            if (boxCount + sphereCount > 0) {
                if (boxCount > 0)
                    run(
                        'LCPFlow.proxiesBox',
                        bound.compute('lcp_bp_proxies_box'),
                        stepOffset,
                        boxCount,
                    );
                if (sphereCount > 0)
                    run(
                        'LCPFlow.proxiesSphere',
                        bound.compute('lcp_bp_proxies_sphere'),
                        stepOffset,
                        sphereCount,
                    );
                this.grid.record(frame);
            }
            // Substeps: gravidade (g · dtSub), detecção de contato e solve — predict e commit ficam fora.
            for (let k = 0; k < this.substeps; k++) {
                const subOffset = [this.params.offset(step * perStep + 1 + k)];
                run('LCPFlow.gravity', gravity, subOffset, bodyCount);
                if (totalCol === 0) continue;
                // Lista compactada, contatos por corpo e somas do solve recomeçam a cada substep; a região da
                // tabela de warm start que este substep grava é zerada (no fluxo de comandos).
                const stamp = work.stamps[step * this.substeps + k] ?? 0;
                frame.clear(this.counter);
                frame.clear(this.bodySplit);
                frame.clear(this.bodyDelta);
                frame.clear(this.warm, (stamp & 1) * warmRegionBytes, warmRegionBytes);
                // Pares candidatos com a velocidade deste substep (a mesma da profundidade preditiva da narrowphase).
                if (boxCount + sphereCount > 0) {
                    frame.clear(this.pairCounts);
                    run('LCPFlow.pairs', bound.compute('lcp_bp_pairs'), subOffset, bodyCount);
                    run('LCPFlow.pairsIndirect', bound.compute('lcp_bp_indirect'), subOffset, 1);
                }
                // Fase 1 — DetectContacts: planos contra todos os corpos; caixas e esferas pelos pares candidatos
                // (despacho indireto); malha não gera contato (P2).
                const planes = work.poolCounts.get('PlaneCollider') ?? 0;
                if (planes > 0)
                    run(
                        'LCPFlow.narrowphase.PlaneCollider',
                        bound.compute('lcp_narrowphase_plane'),
                        subOffset,
                        bodyCount * planes,
                    );
                if (boxCount > 0)
                    runIndirect(
                        'LCPFlow.narrowphase.BoxCollider',
                        bound.compute('lcp_narrowphase_box'),
                        subOffset,
                        NarrowphaseDispatchSchema.offsetOf('box_x'),
                    );
                if (sphereCount > 0)
                    runIndirect(
                        'LCPFlow.narrowphase.SphereCollider',
                        bound.compute('lcp_narrowphase_sphere'),
                        subOffset,
                        NarrowphaseDispatchSchema.offsetOf('sphere_x'),
                    );
                // Superfícies (spec 010): contra todos os corpos, como os planos.
                const surfaces = work.poolCounts.get('SurfaceCollider') ?? 0;
                if (surfaces > 0)
                    run(
                        'LCPFlow.narrowphase.SurfaceCollider',
                        bound.compute('lcp_narrowphase_surface'),
                        subOffset,
                        bodyCount * surfaces,
                    );
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
            frame.clear(this.bodyCorrection);
            if (totalCol > 0)
                run('LCPFlow.accumulate', accumulate, stepOffset, this.contactsCapacity);
            // Commit 1× por passo: pos += vel·stepDt + correção posicional.
            run('LCPFlow.commit', commit, stepOffset, bodyCount);
        }
        // Pose de cada corpo vivo no seu Transform, na GPU (a composição da matriz vem depois, na fase transform).
        if (this.publishCount > 0)
            run('LCPFlow.publishPose', bound.compute('lcp_publish_pose'), [], this.publishCount);
    }

    /** Libera os kernels da grade hash (os buffers são do `LCPWork` e saem da cena com ele). */
    override dispose(): void {
        this.grid.destroy();
    }

    /** Mapas de dono e contagens dos colliders; religa os pools e os mapas de cada narrowphase quando mudam. */
    private refreshColliders(ctx: Ctx): void {
        this.colliderSet.markDirty();
        this.syncColliders(ctx);
    }

    /** Reconstrói os mapas de dono se sujos e religa as fontes que mudaram. */
    private syncColliders(ctx: Ctx): void {
        if (!this.colliderSet.refresh()) return;
        const sources: Sources = new Map();
        for (const shape of SHAPE_POOLS) {
            const pool = this.colliderSet.pool(shape.poolKey);
            sources.set(SHAPE_RESOURCE[shape.poolKey]!, pool.buffer);
            sources.set({ pipeline: shape.pipeline, resource: R.bodyOwners }, pool.owners);
        }
        sources.set(R.boxOwners, this.colliderSet.pool('BoxCollider').owners);
        sources.set(R.sphereOwners, this.colliderSet.pool('SphereCollider').owners);
        sources.set(R.large, this.colliderSet.broadphase().large);
        sources.set(colliderResources.surfaceField, this.colliderSet.fieldBuffer());
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

    private contactSources(): Sources {
        return new Map<BindingKey, BindingSource>([
            [R.contacts, this.contacts],
            [R.contactsRead, this.contacts],
            [R.bVec, this.bVec],
            [R.bVecRead, this.bVec],
            [R.warmTable, this.warm],
        ]);
    }

    private bodySources(): Sources {
        return new Map<BindingKey, BindingSource>([
            [R.bodyCorrection, this.bodyCorrection],
            [R.bodyDelta, this.bodyDelta],
            [R.bodySplitCount, this.bodySplit],
            [R.bodySplit, this.bodySplit],
        ]);
    }

    /** Lista compactada de contatos, bias e tabela de warm start para a capacidade; devolve se recriou. */
    /**
     * Lista compactada de contatos, bias e tabela de warm start para a capacidade (a C2 realoca, nos dois sentidos);
     * devolve se os buffers mudaram. Contatos obsoletos (pool realocado): a tabela de warm start é zerada no próximo
     * quadro gravado.
     */
    private ensureContacts(bodyCount: number, totalCol: number): boolean {
        const capacity = this.contactCapacity(bodyCount, totalCol);
        if (this.contactsStale) {
            this.contactsStale = false;
            this.clearWarm = true;
        }
        if (this.contactsCapacity === capacity) return false;
        this.contactsCapacity = capacity;
        let warmCapacity = 1;
        while (warmCapacity < capacity * 2) warmCapacity *= 2;
        this.warmCapacity = warmCapacity;
        this.lcpWork.work.refresh();
        return true;
    }

    /** Buffers por corpo, crescendo em potências de 2 (a C2 realoca); devolve se mudaram. */
    private ensureBodyBuffers(bodyCount: number): boolean {
        if (this.bodyCapacity > 0 && this.bodyCapacity >= bodyCount) return false;
        let capacity = Math.max(16, this.bodyCapacity);
        while (capacity < bodyCount) capacity *= 2;
        this.bodyCapacity = capacity;
        this.lcpWork.work.refresh();
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
            this.work = {
                steps: 0,
                bodyCount,
                totalCol: 0,
                poolCounts: new Map(),
                stamps: [],
                boxCount: 0,
                sphereCount: 0,
            };
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
            this.resources.writeNow(
                this.lcpWork.work,
                npParamsId(shape.poolKey),
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
        if (this.params.reserve(regions)) ctx.bind(new Map([[R.params, this.params.source()]]));
        // Buffers antes dos parâmetros: a capacidade da lista e da tabela entram em cada região.
        if (this.ensureContacts(bodyCount, totalCol)) ctx.bind(this.contactSources());
        if (this.ensureBodyBuffers(bodyCount)) ctx.bind(this.bodySources());
        const stepDt = time.stepDt;
        const accel = (
            bound.slots.gravity?.resource as GravityField | undefined
        )?.uniformAcceleration() ?? [0, -9.81, 0, 0];
        // Carimbo de cada substep: a paridade escolhe a região da tabela de warm start que ele grava.
        const stamps: number[] = [];
        for (let step = 0; step < steps; step++) {
            const base = step * perStep;
            const start = time.stepTime(step);
            this.writeParams(
                base,
                bodyCount,
                totalCol,
                stepDt,
                stepDt,
                accel,
                this.contactStamp,
                start,
            );
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
                    // Fim do substep k: o mesmo tempo em qualquer taxa (spec 009).
                    start + (k + 1) * (stepDt / this.substeps),
                );
            }
        }
        this.params.flush(regions);
        const shape = this.colliderSet.broadphase();
        this.prepareBroadphase(ctx, bodyCount, steps);
        this.work = {
            steps,
            bodyCount,
            totalCol,
            poolCounts,
            stamps,
            boxCount: shape.boxCount,
            sphereCount: shape.sphereCount,
        };
        this.preparePublish(bound);
        this.stepsSinceOverflowCheck += steps;
        if (this.stepsSinceOverflowCheck >= OVERFLOW_CHECK_STEPS && !this.overflowReadInFlight) {
            this.stepsSinceOverflowCheck = 0;
            this.overflowCopyPending = totalCol > 0;
        }
    }

    /**
     * Broadphase do quadro: proxies (caixas e esferas) e listas de pares pela capacidade, grade hash para os proxies
     * (célula = 2 × o maior raio dos pequenos; `steps` gravações) e parâmetros — recriados e religados aqui.
     */
    private prepareBroadphase(ctx: Ctx, bodyCount: number, steps: number): void {
        const shape = this.colliderSet.broadphase();
        const proxyCount = shape.boxCount + shape.sphereCount;
        if (this.ensureProxies(proxyCount)) ctx.bind(this.broadphaseSources());
        if (this.ensurePairs(bodyCount)) ctx.bind(this.broadphaseSources());
        const cellSize = Math.max(2 * shape.maxSmallRadius, 1e-3);
        if (this.grid.prepare(this.proxies, proxyCount, cellSize, steps))
            ctx.bind(this.gridSources());
        const values = {
            box_count: shape.boxCount,
            sphere_count: shape.sphereCount,
            large_count: shape.largeCount,
            pair_capacity: this.pairCapacity,
            large_radius: Number.isFinite(shape.largeRadius) ? shape.largeRadius : 3.0e38,
            max_small_radius: shape.maxSmallRadius,
            margin_scale: BROADPHASE_MARGIN_SCALE,
            skin: BROADPHASE_SKIN,
            substeps: this.substeps,
        };
        const key = JSON.stringify(values);
        if (key === this.writtenBroadphase) return;
        this.resources.writeNow(
            this.lcpWork.work,
            'lcp_broadphase_params',
            BroadphaseParamsSchema.pack(values),
        );
        this.writtenBroadphase = key;
    }

    /** Buffer de proxies (`vec4f` por collider de caixa e de esfera); devolve se recriou. */
    private ensureProxies(count: number): boolean {
        if (this.proxyCapacity > 0 && this.proxyCapacity >= count) return false;
        let capacity = Math.max(64, this.proxyCapacity);
        while (capacity < count) capacity *= 2;
        this.proxyCapacity = capacity;
        this.lcpWork.work.refresh();
        return true;
    }

    /** Listas de pares por forma (`bodyCount × maxPairsPerBody`); devolve se recriou. */
    private ensurePairs(bodyCount: number): boolean {
        const capacity = Math.max(64, bodyCount * this.maxPairsPerBody);
        if (this.pairCapacity > 0 && this.pairCapacity >= capacity) return false;
        let c = Math.max(64, this.pairCapacity);
        while (c < capacity) c *= 2;
        this.pairCapacity = c;
        this.lcpWork.work.refresh();
        return true;
    }

    private broadphaseSources(): Sources {
        return new Map<BindingKey, BindingSource>([
            [R.proxies, this.proxies],
            [R.boxPairs, this.boxPairs],
            [R.spherePairs, this.spherePairs],
            [{ pipeline: 'lcp_narrowphase_box', resource: R.pairs }, this.boxPairs],
            [{ pipeline: 'lcp_narrowphase_sphere', resource: R.pairs }, this.spherePairs],
        ]);
    }

    private gridSources(): Sources {
        return new Map<BindingKey, BindingSource>([
            [hashGridResources.grid, this.grid.params],
            [R.cellStart, this.grid.cellStart],
            [R.cellCount, this.grid.cellCount],
            [R.cellItems, this.grid.cellItems],
        ]);
    }

    /** Início e tamanho da lista de poses (o grupo único do slot `poses`), escritos quando mudam. */
    private preparePublish(bound: BoundFlow<LCPSlots>): void {
        const list = bound.slots.poses.groups[0];
        this.publishCount = list?.count ?? 0;
        if (list === undefined) return;
        const key = `${list.first}:${list.count}`;
        if (key === this.writtenPublish) return;
        this.resources.writeNow(
            this.lcpWork.work,
            'lcp_publish_params',
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
        fieldTime: number,
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
            field_time: fieldTime,
            field_density: 0,
        });
    }

    /**
     * Quadro enviado: no quadro em que a amostragem vence, lê o contador e as contagens de pares pela leitura sob
     * demanda da C2 (o valor do último quadro enviado; sem bloquear o quadro).
     */
    private readOverflowCounter(): void {
        if (!this.overflowCopyPending) return;
        this.overflowCopyPending = false;
        this.overflowReadInFlight = true;
        // Defer ao próximo macrotask: o `submit` do quadro já rodou antes da leitura.
        setTimeout(() => {
            const work = this.lcpWork.work;
            Promise.all([
                this.resources.read(work, 'lcp_contact_counter'),
                this.resources.read(work, 'lcp_pair_counts'),
            ])
                .then(([counter, pairs]) => {
                    if (counter !== undefined)
                        this.reportContactOverflow(
                            Number(counter.count ?? 0),
                            Number(counter.overflow ?? 0),
                        );
                    if (pairs !== undefined) this.reportPairOverflow(Number(pairs.overflow ?? 0));
                })
                .catch(() => {
                    /* device perdido ou cena descartada: a leitura é descartada */
                })
                .finally(() => {
                    this.overflowReadInFlight = false;
                });
        }, 0);
    }

    private pairOverflowWarned = false;

    /** Avisa (uma vez) quando a broadphase encontrou mais pares candidatos que a capacidade das listas. */
    protected reportPairOverflow(overflow: number): void {
        if (overflow === 0 || this.pairOverflowWarned) return;
        this.pairOverflowWarned = true;
        console.warn(
            `[LCPFlow] ${overflow} pares candidatos acima da capacidade (${this.pairCapacity} por forma) foram `
                + 'ignorados — aumente LCPFlowOptions.maxPairsPerBody.',
        );
    }

    /** Avisa (uma vez) quando a narrowphase encontrou mais contatos que a capacidade da lista compactada. */
    protected reportContactOverflow(count: number, overflow: number): void {
        if (overflow === 0 || this.overflowWarned) return;
        this.overflowWarned = true;
        console.warn(
            `[LCPFlow] ${overflow} contatos acima da capacidade (${this.contactsCapacity}; ${count} encontrados no `
                + 'último substep) foram ignorados — aumente LCPFlowOptions.maxContactsPerBody.',
        );
    }
}

/** Id do descritor dos parâmetros de narrowphase da forma no trabalho. */
function npParamsId(poolKey: string): string {
    return `lcp_np_params_${poolKey}`;
}
