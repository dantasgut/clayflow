import type {
    BindingKey,
    BindingSource,
    BoundFlow,
    PreparedCompute,
    TransitionContext,
} from '../../scene/flows/FlowBinding';
import type {
    ComputePass,
    Frame,
    IndirectBufferSpec,
    StorageBufferSpec,
} from '../../scene/contracts/gpu';
import type { ResourceDirectory } from '../../scene/contracts/ResourceDirectory';
import type { EntityId } from '../../scene/world/EntityId';
import type { World } from '../../scene/world/World';
import { Flow } from '../../scene/flows/Flow';
import { FlowWork, type WorkContext } from '../../scene/flows/FlowWork';
import type { GPUDescriptor } from '../../scene/descriptors/GPUDescriptor';
import { StructSchema } from '../../scene/descriptors/StructSchema';
import type { FlowContext } from '../../scene/flows/FlowRegistry';
import type { FlowTransitions } from '../../scene/flows/FlowTransitions';
import {
    slot,
    type EntitiesSlot,
    type PoolsSlot,
    type SingletonSlot,
    type SlotMap,
    type WorkSlot,
} from '../../scene/flows/slots';
import type { WgslModule } from '../../scene/shaders/WgslModule';
import type { PipelineDescriptor } from '../../scene/descriptors/PipelineDescriptor';
import { NONE, WORKGROUP_SIZE } from '../../scene/shaders/engineConstants';
import { CountToArgs } from '../gpu/compute/CountToArgs';
import { wordBuffer } from '../gpu/compute/schemas';
import { PerStepUniforms } from '../gpu/compute/PerStepUniforms';
import { SpatialHashGrid } from '../gpu/compute/SpatialHashGrid';
import { MaterialFunction } from '../extension/MaterialFunction';
import { RayScene } from '../raytrace/RayScene';
import { RayWave } from '../raytrace/RayWave';
import { isFieldBody } from './fieldBody';
import { ParticleBody } from '../physics/bodies/ParticleBody';
import { ParticlePhysics } from '../physics/ParticlePhysics';
import { SET_COUNT_DISPATCH_OFFSET } from '../../scene/graph/SetCountSchema';
import { FIELD } from './reference/field';
import { Time } from '../../scene/time/Time';
import { Light } from '../scene/Light';
import {
    FluidField,
    fieldAtlasOffset,
    fieldDataLayout,
    fieldFilmOffset,
    fieldMediaOffset,
} from './FluidField';
import { GravityField } from '../physics/forcefields/GravityField';
import { Collider } from '../physics/colliders/Collider';
import { COLLIDER_POOL_KEYS, ColliderSet } from '../physics/colliders/ColliderSet';
import { colliderResources } from '../physics/colliders/colliderResources';
import { LCPSchema } from '../physics/bodies/schemas/LCPSchema';
import { SurfacePhysics } from '../physics/wetting/SurfacePhysics';
import { Atmosphere } from '../physics/wetting/Atmosphere';
import { filmSurfaceTerms, type WettingLiquid } from '../physics/wetting/wetting';
import {
    FIELD_BRICK_VOXELS,
    FIELD_FILM_CELLS,
    FIELD_FILM_SURFACES,
    FIELD_LIGHT_MAPS,
    FIELD_LIGHT_RES,
    FIELD_MAX_BODIES,
    FIELD_PARTICLES_PER_BRICK,
    FieldGatherSchema,
    fieldContactShape,
} from './schemas';
import {
    fieldApron,
    fieldBodyClosures,
    fieldLightMap,
    fieldMesh,
    fieldFilmDeposit,
    fieldFilmStep,
    fieldDensity,
    fieldGather,
    fieldSort,
    fieldKernels,
    fieldLinks,
    fieldMark,
    fieldRedistance,
    fieldResources as R,
} from './shaders';

/** Slots do estágio do campo. */
export interface FluidFieldSlots extends SlotMap {
    /** O campo da cena (inserido pelos estágios padrão). */
    readonly field: SingletonSlot<false>;
    /** Os corpos de partículas (os de superfície de fluido, `isFieldBody`, entram no campo). */
    readonly bodies: EntitiesSlot;
    /** A estrutura de raios: a composição das funções `material` dos acertos, onde a do corpo tem o seu índice. */
    readonly rays: SingletonSlot<true>;
    /** A física das partículas (o espaçamento). */
    readonly particlePhysics: SingletonSlot<true>;
    /** O tempo da cena: o nível da superfície só se ajusta nos quadros em que a simulação avança. */
    readonly time: SingletonSlot<true>;
    /** A gravidade: o escoamento da película de água nos sólidos (spec 034; sem ela, −9,81 em y). */
    readonly gravity: SingletonSlot<true>;
    /** Pools de colliders e de corpos rígidos: a superfície dos sólidos, por onde a película escorre (spec 034). */
    readonly colliderPools: PoolsSlot;
    /** Entidades com collider. */
    readonly colliders: EntitiesSlot;
    /** A física da superfície dos sólidos (spec 034): rugosidade, histerese, poros, temperatura. */
    readonly surfaces: EntitiesSlot;
    /** O ar da cena: a evaporação da película (sem ele, `Atmosphere.defaults`). */
    readonly atmosphere: SingletonSlot<true>;
    /** O espaço de trabalho da junção e da reconstrução: temporários, grade, regiões, a onda (spec 039). */
    readonly work: WorkSlot<FieldWork>;
}

/** Resource de trabalho do `FluidFieldFlow` (spec 039). */
class FieldWork extends FlowWork {
    static readonly schema = new StructSchema('FieldWork', {});
}

/** Capacidades dos temporários (partículas por dobra; blocos pela capacidade do campo). */
interface ScratchSize {
    readonly particles: number;
    readonly bricks: number;
}

/**
 * O líquido da película sem a física de superfície no `ParticlePhysics` (`surfaceTension`): a água (0,072 N/m, 30°) —
 * a película é a água que as partículas deixam.
 */
const WATER_FILM = { surfaceTension: 0.072, contactAngle: 30 };

/** Água que os poros guardam no máximo (m): o alcance do ponto fixo da película (`FIELD_FILM_UNIT`). */
const FILM_MAX_CAPACITY = 0.04;

/** Recursos do conjunto de colliders que o passo da película lê (a distância e a superfície, sem a malha). */
const FILM_COLLIDER_RESOURCES = new Set([
    colliderResources.counts,
    colliderResources.planes,
    colliderResources.boxes,
    colliderResources.spheres,
    colliderResources.owners,
    colliderResources.bodies,
    colliderResources.surfaceField,
    colliderResources.surfaces,
]);

type Ctx = TransitionContext<FluidFieldSlots>;

/** O acerto sintético de cada corpo na onda e a cópia do fechamento avaliado (spec 039). */
const BODY_RECORD: PipelineDescriptor = {
    id: 'field_body_record',
    role: 'compute',
    shader: fieldBodyClosures,
    entryPoints: ['field_body_record_main'],
};
const BODY_CLOSURE: PipelineDescriptor = {
    id: 'field_body_closure',
    role: 'compute',
    shader: fieldBodyClosures,
    entryPoints: ['field_body_closure_main'],
};

/** O mapa da luz pela água (spec 039 refeita): uma marcha por texel de cada luz direcional com mapa. */
const LIGHT_MAP: PipelineDescriptor = {
    id: 'field_light_map',
    role: 'compute',
    shader: fieldLightMap,
    entryPoints: ['field_light_map_main'],
};

/** Corpo de água acompanhado: a aparência pela função `material` (o grafo). */
interface FieldBody {
    readonly entity: EntityId;
    readonly body: ParticleBody;
    readonly fn: MaterialFunction | undefined;
    readonly poolKey: string;
}

/** Buffers de trabalho (por capacidade de partículas e de blocos). */
interface Work {
    readonly particles: number;
    readonly bricks: number;
    readonly items: StorageBufferSpec;
    readonly sorted: StorageBufferSpec;
    /** O contato de cada partícula na junção e na ordem da grade (spec 034). */
    readonly contacts: StorageBufferSpec;
    readonly sortedContacts: StorageBufferSpec;
    readonly kernel: StorageBufferSpec;
    readonly links: StorageBufferSpec;
    readonly density: StorageBufferSpec;
    readonly phi0: StorageBufferSpec;
    readonly phiA: StorageBufferSpec;
}

const kernel = (id: string, shader: WgslModule, entry: string): PipelineDescriptor => ({
    id: `field_${id}`,
    role: 'compute',
    shader,
    entryPoints: [entry],
});

/**
 * Os kernels da construção do campo, preparados pela C2 (spec 031): as fontes privadas por `ctx.bind` — por pipeline
 * só onde o mesmo recurso (`field_src`, `field_dst`) lê ou grava um temporário diferente em cada etapa.
 */
const SORT = kernel('sort', fieldSort, 'field_sort_main');
const KERNELS = kernel('kernels', fieldKernels, 'field_kernels_main');
const CLEAR = kernel('clear', fieldMark, 'field_clear_main');
const MARK = kernel('mark', fieldMark, 'field_mark_main');
/** A película de água nos sólidos (spec 034): o passo por célula (absorção, evaporação, escoamento), a deposição. */
const FILM_STEP = kernel('film_step', fieldFilmStep, 'field_film_step_main');
const FILM_DEPOSIT = kernel('film_deposit', fieldFilmDeposit, 'field_film_deposit_main');
const LINKS = kernel('links', fieldLinks, 'field_links_main');
const DENSITY = kernel('density', fieldDensity, 'field_density_main');
/** Filtro separável da densidade: B (ponto fixo) → A → P → A. */
const SMOOTH = [
    kernel('smooth_x', fieldRedistance, 'field_smooth_x_main'),
    kernel('smooth_y', fieldRedistance, 'field_smooth_y_main'),
    kernel('smooth_z', fieldRedistance, 'field_smooth_z_main'),
] as const;
/** Filtrada (A) → φ inicial (P). */
const INIT = kernel('init', fieldRedistance, 'field_init_main');
/** φ inicial (P) → interface e sinais (A) e a primeira distância (B). */
const CLASSIFY = kernel('classify', fieldRedistance, 'field_classify_main');
/** Iterações da eikonal B → P e P → B. */
const FORWARD = kernel('eikonal_bp', fieldRedistance, 'field_eikonal_main');
const BACKWARD = kernel('eikonal_pb', fieldRedistance, 'field_eikonal_main');
const APRON = kernel('apron', fieldApron, 'field_apron_main');
/** A malha da superfície (spec 039 refeita): a extração por bloco e os argumentos do desenho. */
const MESH = kernel('mesh', fieldMesh, 'field_mesh_main');
const MESH_ARGS = kernel('mesh_args', fieldMesh, 'field_mesh_args_main');
const BUILD = [
    SORT,
    KERNELS,
    CLEAR,
    MARK,
    FILM_STEP,
    FILM_DEPOSIT,
    LINKS,
    DENSITY,
    ...SMOOTH,
    INIT,
    CLASSIFY,
    FORWARD,
    BACKWARD,
    APRON,
    MESH,
    MESH_ARGS,
];

/** A junção de um pool de corpos de água (um pipeline por pool: as partículas dele). */
const gatherKernel = (poolKey: string): PipelineDescriptor =>
    kernel(`gather:${poolKey}`, fieldGather, 'field_gather_main');

/** Espaçamento padrão das partículas quando a cena não tem `ParticlePhysics`. */
const DEFAULT_SPACING = 0.05;

/**
 * FluidFieldFlow — o campo dos fluidos na GPU a cada quadro (spec 033, R11), depois da física e antes da estrutura de
 * raios. As partículas dos corpos de fluido (`isFieldBody`) vão a um array compacto; a grade hash dá os vizinhos; os
 * núcleos anisotrópicos (Yu & Turk) saem da covariância; os blocos de 8³ cobertos pelos núcleos entram na tabela do
 * `FluidField` (contagem só na GPU); a densidade nos voxels, o φ inicial, as iterações do redistanciamento e os voxels
 * com a borda — os quatro por despacho indireto, um grupo por bloco. Nenhuma leitura de volta. Sem água, nada. Por
 * corpo (até `FIELD_MAX_BODIES`; a palavra dos blocos é o índice + 1), a tabela `bodies` do uniform do campo: o índice
 * da função `material` dele na composição dos acertos dos raios (`RayScene.materialFunctions`) e o slot dos parâmetros
 * dela — quem traça avalia o fechamento da água no acerto (`ray_volume_surface`).
 */
export class FluidFieldFlow extends Flow<FluidFieldSlots, 'idle'> {
    readonly type = 'FluidFieldFlow';
    readonly slots: FluidFieldSlots;
    protected readonly initialState = 'idle' as const;
    protected readonly transitions: FlowTransitions<'idle', Ctx>;

    private readonly work: WorkContext;
    private readonly resources: ResourceDirectory;
    private readonly world: World;
    private readonly bodies = new Map<EntityId, FieldBody>();
    private readonly draws: PerStepUniforms;
    private readonly grid: SpatialHashGrid;
    private readonly args: CountToArgs;
    /** Os sólidos, para a película (spec 034): a superfície por onde ela escorre e a física de cada um. */
    private readonly colliderSet: ColliderSet;
    /** A onda dos acertos do material de cada corpo (spec 039): o meio que a absorção dos trechos lê. */
    private readonly wave: RayWave;
    private waveRevision = -1;
    private closuresPrepared = false;
    private order: FieldBody[] = [];
    /** Conteúdo escrito nas regiões da junção e no uniform do campo (escritos quando mudam, não por quadro). */
    private drawsWritten = '';
    private paramsWritten = '';
    private scratchSize: ScratchSize | undefined;
    /** As fontes privadas ligadas (pela identidade de cada uma): religadas quando alguma muda. */
    private boundKey = '';
    private buildPrepared = false;
    /** Os pools com o pipeline da junção preparado. */
    private readonly gatherPools = new Set<string>();
    /** A simulação avançou no quadro: a película de água escoa e recebe a deposição (spec 034). */
    private filmAdvances = false;
    /**
     * O campo é refeito neste quadro: a simulação avançou ou mudou o que ele lê (os parâmetros, as capacidades, a grade).
     * Com as partículas paradas o campo refeito é o mesmo (o nível fica, `motion` 0): a GPU não o refaz em cada quadro
     * desenhado entre dois passos da física.
     */
    private rebuilds = true;
    private field: FluidField | undefined;
    private particles = 0;
    private active = false;
    private readonly ids = new WeakMap<object, number>();
    private nextId = 0;
    private overflowWarned = false;

    constructor(ctx: FlowContext) {
        super();
        const work = new FieldWork();
        this.work = { core: ctx.core, resources: ctx.resources, work };
        this.slots = {
            field: slot.singleton(FluidField.schema),
            bodies: slot.entities({ all: [ParticleBody] }),
            rays: slot.singleton(RayScene.schema, { optional: true }),
            particlePhysics: slot.singleton(ParticlePhysics.schema, { optional: true }),
            time: slot.singleton(Time.schema, { optional: true }),
            gravity: slot.singleton(GravityField.schema, { optional: true }),
            colliderPools: slot.pools([...COLLIDER_POOL_KEYS, LCPSchema.name]),
            colliders: slot.entities({ all: [Collider] }),
            surfaces: slot.entities({ all: [SurfacePhysics] }),
            atmosphere: slot.singleton(Atmosphere.schema, { optional: true }),
            work: slot.work(() => work),
        };
        // O volume do campo somado no quadro e os temporários da junção e da reconstrução.
        work.use({
            descriptors: () => [wordBuffer('field_volume', 16), ...this.scratchDescriptors()],
        });
        this.wave = new RayWave(this.work, 'field');
        this.resources = ctx.resources;
        this.world = ctx.world;
        this.draws = new PerStepUniforms(this.work, {
            id: 'field_gather',
            schema: FieldGatherSchema,
        });
        this.draws.reserve(1);
        this.grid = new SpatialHashGrid(this.work, {
            discriminator: 'field_grid',
            label: 'FluidFieldFlow.grid',
        });
        this.args = new CountToArgs(this.work, { discriminator: 'field_args' });
        this.colliderSet = new ColliderSet(this.work, ctx.world, {
            discriminator: 'field_colliders',
        });
        this.transitions = {
            '*': {
                slotsResolved: {
                    to: 'idle',
                    run: (_e, c) => {
                        this.track(
                            c,
                            c.bound.slots.bodies.entries.map((e) => e.entityId),
                            [],
                        );
                    },
                },
                entitiesChanged: {
                    to: 'idle',
                    run: (e, c) => {
                        if (e.type !== 'entitiesChanged') return;
                        this.track(c, e.added, e.removed);
                        this.colliderSet.markDirty();
                    },
                },
                slotChanged: {
                    to: 'idle',
                    run: () => {
                        this.colliderSet.markDirty();
                    },
                },
                slotLost: 'ignore',
                pipelinesCompiled: 'ignore',
                bindGroupReplaced: 'ignore',
                poolReallocated: {
                    to: 'idle',
                    run: (e) => {
                        if (e.type === 'poolReallocated')
                            this.colliderSet.onPoolReallocated(e.poolKey);
                    },
                },
                framePrepare: {
                    to: 'idle',
                    run: (_e, c) => {
                        this.prepare(c);
                    },
                },
            },
        };
    }

    /** Grava a construção do campo e o material de cada corpo. */
    dispatch(frame: Frame, bound: BoundFlow<FluidFieldSlots>): void {
        const work = this.scratch;
        const field = this.field;
        const counts = field === undefined ? undefined : this.counts(field);
        if (!this.active || work === undefined || counts === undefined) return;
        // Enquanto algum kernel compila (em segundo plano), o campo fica para o quadro seguinte.
        if (this.rebuilds && this.buildReady(bound)) {
            this.rebuild(frame, bound, work, field!, counts);
            this.rebuilds = false;
        }
        this.dispatchClosures(frame, bound);
        this.dispatchLightMap(frame, bound);
    }

    /** Os kernels da construção (e a junção de cada corpo) compilados. */
    private buildReady(bound: BoundFlow<FluidFieldSlots>): boolean {
        const ready = (id: string): boolean => {
            const p = bound.pipelines.get(id);
            return p?.role === 'compute' && p.ready;
        };
        return (
            this.buildPrepared
            && BUILD.every((d) => ready(d.id))
            && this.order.every((b) => ready(gatherKernel(b.poolKey).id))
        );
    }

    /** A construção do campo pelas partículas: a junção, a grade, os núcleos, os blocos, a distância e a malha. */
    private rebuild(
        frame: Frame,
        bound: BoundFlow<FluidFieldSlots>,
        work: Work,
        field: FluidField,
        counts: IndirectBufferSpec,
    ): void {
        const W = WORKGROUP_SIZE.value;
        const at = (d: PipelineDescriptor): PreparedCompute => bound.compute(d.id);
        frame.compute('FluidFieldFlow.gather', (pass) => {
            this.order.forEach((b, i) => {
                const gather = at(gatherKernel(b.poolKey));
                pass.bind.setPipeline(gather.spec);
                gather.bindTo(pass.bind, { draw: [this.draws.offset(i)] });
                pass.dispatch.invocations(b.body.count, W);
            });
        });
        this.grid.record(frame);
        const table = field.capacity.table;
        frame.compute('FluidFieldFlow.kernels', (pass) => {
            this.run(pass, at(SORT), this.particles, W);
            this.run(pass, at(KERNELS), this.particles, W);
        });
        frame.compute('FluidFieldFlow.mark', (pass) => {
            this.run(pass, at(CLEAR), table + 1, W);
            this.run(pass, at(MARK), this.particles, W);
            this.run(pass, at(LINKS), work.bricks, W);
        });
        // A película de água nos sólidos (spec 034): só nos quadros em que a simulação avança (parada, fica).
        if (this.filmAdvances) {
            frame.compute('FluidFieldFlow.film', (pass) => {
                this.run(pass, at(FILM_STEP), FIELD_FILM_CELLS, W);
                this.run(pass, at(FILM_DEPOSIT), this.particles, W);
            });
        }
        this.args.record(frame, { counts, index: 0, workgroupSize: 1 });
        // A densidade é somada em ponto fixo: o buffer (também o segundo do redistanciamento) começa zerado.
        frame.clear(work.density);
        frame.compute('FluidFieldFlow.density', (pass) => {
            this.run(pass, at(DENSITY), this.particles, W);
        });
        const indirect = (label: string, kernels: readonly PipelineDescriptor[]): void => {
            frame.compute(label, (pass) => {
                for (const d of kernels) {
                    const k = at(d);
                    pass.bind.setPipeline(k.spec);
                    k.bindTo(pass.bind);
                    pass.dispatch.workgroupsIndirect(counts, SET_COUNT_DISPATCH_OFFSET);
                }
            });
        };
        indirect('FluidFieldFlow.smooth', SMOOTH);
        indirect('FluidFieldFlow.init', [INIT, CLASSIFY]);
        indirect(
            'FluidFieldFlow.redistance',
            Array.from({ length: FIELD.iterations }, (_, n) => (n % 2 === 0 ? FORWARD : BACKWARD)),
        );
        indirect('FluidFieldFlow.apron', [APRON]);
        // A malha da superfície: a contagem zerada, um grupo por bloco, os argumentos do desenho.
        const meshArgs = this.counts(field, 'meshArgs');
        if (meshArgs !== undefined) frame.clear(meshArgs, 16, 4);
        frame.compute('FluidFieldFlow.mesh', (pass) => {
            const mesh = at(MESH);
            pass.bind.setPipeline(mesh.spec);
            mesh.bindTo(pass.bind);
            pass.dispatch.workgroupsIndirect(counts, SET_COUNT_DISPATCH_OFFSET);
            this.run(pass, at(MESH_ARGS), 1, 1);
        });
    }

    /** O mapa da luz pela água (depois do meio dos corpos, que ele lê). */
    private dispatchLightMap(frame: Frame, bound: BoundFlow<FluidFieldSlots>): void {
        const map = bound.pipelines.get(LIGHT_MAP.id);
        if (map?.role !== 'compute' || !map.ready) return;
        frame.compute('FluidFieldFlow.lightMap', (pass) => {
            pass.bind.setPipeline(map.spec);
            map.bindTo(pass.bind);
            pass.dispatch.invocations(
                FIELD_LIGHT_MAPS * FIELD_LIGHT_RES * FIELD_LIGHT_RES,
                WORKGROUP_SIZE.value,
            );
        });
    }

    /**
     * O material de cada corpo na onda (spec 039): o acerto sintético de cada um, o material por classe e a cópia do
     * fechamento para `field_body_closures` (o meio que a absorção dos trechos dentro da água lê).
     */
    private dispatchClosures(frame: Frame, bound: BoundFlow<FluidFieldSlots>): void {
        const record = bound.pipelines.get(BODY_RECORD.id);
        const close = bound.pipelines.get(BODY_CLOSURE.id);
        if (
            record?.role !== 'compute'
            || !record.ready
            || close?.role !== 'compute'
            || !close.ready
            || !this.wave.ready(bound)
        )
            return;
        const W = WORKGROUP_SIZE.value;
        frame.compute('FluidFieldFlow.closures', (pass) => {
            this.wave.reset(pass, bound);
            pass.bind.setPipeline(record.spec);
            record.bindTo(pass.bind);
            pass.dispatch.invocations(FIELD_MAX_BODIES, W);
            this.wave.shade(pass, bound);
            pass.bind.setPipeline(close.spec);
            close.bindTo(pass.bind);
            pass.dispatch.invocations(FIELD_MAX_BODIES, W);
        });
    }

    /**
     * A onda do material dos corpos (um raio por corpo da tabela) e os kernels de material por classe da revisão das
     * funções `material` da estrutura de raios; os kernels dos corpos na primeira vez.
     */
    private syncClosures(ctx: Ctx): void {
        const scene = ctx.bound.slots.rays?.resource as RayScene | undefined;
        const revision = scene?.materialRevision ?? 0;
        if (this.closuresPrepared && this.waveRevision === revision) return;
        this.waveRevision = revision;
        const w = this.wave.ensure(FIELD_MAX_BODIES, scene?.materialFunctions ?? [], revision);
        if (w.bindings !== undefined) ctx.bind(w.bindings);
        for (const id of w.released) ctx.release(id);
        for (const p of w.pipelines) ctx.prepare(p);
        if (!this.closuresPrepared) {
            ctx.prepare(BODY_RECORD);
            ctx.prepare(BODY_CLOSURE);
            this.resources.ensurePool(Light.schema);
            ctx.prepare(LIGHT_MAP);
            this.closuresPrepared = true;
        }
    }

    /** Libera a grade e os argumentos (os kernels são da C2). */
    override dispose(): void {
        this.grid.destroy();
        this.args.destroy();
    }

    /** Volume do campo somado no quadro (lido pela limpeza do seguinte: o nível que conserva o volume). */
    private get volume(): StorageBufferSpec {
        return this.resources.bufferOf(this.work.work, 'field_volume') as StorageBufferSpec;
    }

    /** Os temporários no Resource de trabalho, pelas capacidades atuais (spec 039). */
    private scratchDescriptors(): readonly GPUDescriptor[] {
        const n = this.scratchSize;
        if (n === undefined) return [];
        const voxels = n.bricks * FIELD_BRICK_VOXELS * 4;
        return [
            wordBuffer('field_items', n.particles * 16),
            wordBuffer('field_sorted', n.particles * 16),
            wordBuffer('field_contacts', n.particles * 16),
            wordBuffer('field_sorted_contacts', n.particles * 16),
            wordBuffer('field_kernel', n.particles * 48),
            wordBuffer('field_links', n.bricks * 28 * 4),
            wordBuffer('field_density', voxels),
            wordBuffer('field_phi0', voxels),
            wordBuffer('field_phi_a', voxels),
        ];
    }

    /** Os temporários que a C2 alocou (ou `undefined` antes do primeiro dimensionamento). */
    private get scratch(): Work | undefined {
        const n = this.scratchSize;
        if (n === undefined) return undefined;
        const of = (name: string): StorageBufferSpec =>
            this.resources.bufferOf(this.work.work, `field_${name}`) as StorageBufferSpec;
        return {
            ...n,
            items: of('items'),
            sorted: of('sorted'),
            contacts: of('contacts'),
            sortedContacts: of('sorted_contacts'),
            kernel: of('kernel'),
            links: of('links'),
            density: of('density'),
            phi0: of('phi0'),
            phiA: of('phi_a'),
        };
    }

    private run(pass: ComputePass, kernel: PreparedCompute, count: number, size: number): void {
        if (count <= 0) return;
        pass.bind.setPipeline(kernel.spec);
        kernel.bindTo(pass.bind);
        pass.dispatch.invocations(count, size);
    }

    /** Corpos que entraram e saíram. */
    private track(ctx: Ctx, added: readonly EntityId[], removed: readonly EntityId[]): void {
        for (const id of removed) this.bodies.delete(id);
        const entries = ctx.bound.slots.bodies;
        for (const id of added) {
            const entry = entries.entry(id);
            if (entry === undefined || !isFieldBody(entry.resources)) continue;
            const body = entry.get(ParticleBody);
            const fn = entry.resources.find(
                (r): r is MaterialFunction => r instanceof MaterialFunction,
            );
            const poolKey = this.resources.poolKeyForResource(body);
            if (poolKey === undefined) continue;
            this.bodies.set(id, { entity: id, body, fn, poolKey });
        }
    }

    /** O registro da contagem dos blocos (descritor indireto do campo). */
    private counts(field: FluidField, id = 'counts'): IndirectBufferSpec | undefined {
        const buffer = this.resources.bufferOf(field, id);
        return buffer?.subkind === 'indirect' ? buffer : undefined;
    }

    private buffer(field: FluidField, id: string): StorageBufferSpec | undefined {
        const buffer = this.resources.bufferOf(field, id);
        return buffer?.subkind === 'storage' ? buffer : undefined;
    }

    /** Antes da gravação: capacidades, buffers, grade, regiões, parâmetros e kernels. */
    private prepare(ctx: Ctx): void {
        const field = ctx.bound.slots.field.resource as FluidField;
        this.field = field;
        const live = [...this.bodies.values()].filter((b) => b.body.count > 0);
        if (live.length > FIELD_MAX_BODIES && !this.overflowWarned) {
            this.overflowWarned = true;
            console.error(
                `[FluidFieldFlow] ${live.length} corpos de fluido; o campo tem ${FIELD_MAX_BODIES}: os demais ficam de fora`,
            );
        }
        this.order = live.slice(0, FIELD_MAX_BODIES);
        this.particles = this.order.reduce((n, b) => n + b.body.count, 0);
        this.active = this.particles > 0;
        field.setVolume(this.active);
        if (!this.active) return;
        const bricks = Math.max(64, Math.ceil(this.particles / FIELD_PARTICLES_PER_BRICK));
        field.reserve({ bricks, table: bricks * 4 });
        const capacity = field.capacity.bricks;
        const counts = this.counts(field);
        const data = this.buffer(field, 'data');
        if (counts === undefined || data === undefined) {
            this.active = false;
            return;
        }
        const work = this.ensureWork(this.particles, capacity);
        const physics = ctx.bound.slots.particlePhysics?.resource as ParticlePhysics | undefined;
        const spacing = physics?.data.particleSpacing ?? DEFAULT_SPACING;
        const radius = FIELD.radius * spacing;
        const gridRebuilt = this.grid.prepare(work.items, this.particles, radius);
        this.args.prepare(counts);
        this.writeDraws();
        const layout = fieldDataLayout(field.capacity);
        const params: [Record<string, number[] | number[][]>] = [
            {
                sizes: [this.particles, capacity, field.capacity.table - 1, FIELD.iterations],
                grid: [spacing, FIELD.voxel * spacing, radius, FIELD.band * FIELD.voxel * spacing],
                tuning: [FIELD.smoothing, FIELD.ratio, FIELD.sparse, FIELD.iso],
                limits: [FIELD.neighbors, 32, layout.bricks, fieldAtlasOffset(field.capacity)],
                // Sem passo de simulação no quadro (pausa, `step(0)`) o nível fica: a imagem não depende de quantos
                // quadros foram desenhados com as partículas paradas.
                motion: [this.advanced(ctx) ? 1 : 0, 0, 0, 0],
                time: [
                    (ctx.bound.slots.time?.resource as Time | undefined)?.simulated ?? 0,
                    0,
                    0,
                    0,
                ],
                media: [fieldMediaOffset(field.capacity), FIELD_MAX_BODIES, 0, 0],
                lights: [0, FIELD_LIGHT_RES, FIELD_LIGHT_MAPS, 0],
                contact: [
                    ...fieldContactShape(physics?.contactAngle ?? 90),
                    this.advancedTime(ctx),
                    0,
                ],
                film: [fieldFilmOffset(field.capacity), FIELD_FILM_CELLS - 1, 0, 0],
                filmFlow: [
                    ...this.gravity(ctx),
                    (physics?.viscosity ?? 0.001) / (physics?.restDensity ?? 1000),
                ],
                filmBoundsMin: [
                    ...(physics?.domainMin ?? [-2, -2, -2]),
                    physics?.openBounds === true ? 0 : 1,
                ],
                filmBoundsMax: [...(physics?.domainMax ?? [2, 2, 2]), 0],
                filmSurfaces: this.surfaceTable(ctx, physics),
                bodies: this.bodyTable(ctx),
            },
        ];
        this.filmAdvances = this.advanced(ctx);
        const paramsKey = JSON.stringify(params);
        this.rebuilds ||= this.filmAdvances || gridRebuilt || paramsKey !== this.paramsWritten;
        if (paramsKey !== this.paramsWritten) {
            this.paramsWritten = paramsKey;
            field.data.params = params;
        }
        this.colliderSet.refresh();
        this.syncKernels(ctx, field, work);
        this.syncClosures(ctx);
    }

    /**
     * A tabela das superfícies da película (`FIELD_FILM_SURFACES` entradas, duas linhas cada): a padrão
     * (`SurfacePhysics.defaults`) e as `SurfacePhysics` da cena na ordem da consulta — a mesma do mapa dos colliders
     * (`ColliderSet`) —, com o líquido (o `ParticlePhysics`) e o ar (`Atmosphere`).
     */
    private surfaceTable(ctx: Ctx, physics: ParticlePhysics | undefined): number[][] {
        const air =
            (ctx.bound.slots.atmosphere?.resource as Atmosphere | undefined) ?? Atmosphere.defaults;
        const physical = physics !== undefined && physics.surfaceTension > 0;
        const liquid: WettingLiquid = {
            surfaceTension: physical ? physics.surfaceTension : WATER_FILM.surfaceTension,
            contactAngle: physical ? physics.contactAngle : WATER_FILM.contactAngle,
            viscosity: physics?.viscosity ?? 0.001,
            density: physics?.restDensity ?? 1000,
        };
        const surfaces = this.world
            .queryBySchemaName(SurfacePhysics.schema.name)
            .slice(0, SurfacePhysics.MAX)
            .map(
                (id) =>
                    this.world
                        .resourcesOf(id)
                        .find((r): r is SurfacePhysics => r instanceof SurfacePhysics)
                    ?? SurfacePhysics.defaults,
            );
        const rows: number[][] = [];
        for (let k = 0; k < FIELD_FILM_SURFACES.value; k++) {
            const t = filmSurfaceTerms(
                k === 0 ? SurfacePhysics.defaults : (surfaces[k - 1] ?? SurfacePhysics.defaults),
                liquid,
                air,
            );
            rows.push(
                [
                    t.retentionPerDensity,
                    t.mobility,
                    t.washburn,
                    Math.min(t.capacity, FILM_MAX_CAPACITY),
                ],
                [t.evaporation, 0, 0, 0],
            );
        }
        return rows;
    }

    /**
     * A tabela dos corpos (na ordem da junção): o índice + 1 da função `material` na composição dos acertos dos raios
     * (0 sem ela, ou enquanto a estrutura de raios ainda não a reuniu) e o slot dos parâmetros dela.
     */
    private bodyTable(ctx: Ctx): number[][] {
        const functions =
            (ctx.bound.slots.rays?.resource as RayScene | undefined)?.materialFunctions ?? [];
        return this.order.map((b) => {
            const module = b.fn?.composite?.module;
            const index =
                module === undefined ? -1 : functions.findIndex((f) => f.module === module);
            const params = b.fn?.getDescriptors()[0]?.schema?.name;
            const fnSlot =
                index < 0 || params === undefined
                    ? 0
                    : (this.resources.poolSlotOf(params, b.entity) ?? 0);
            return [index + 1, fnSlot, 0, 0];
        });
    }

    /** A gravidade uniforme da cena (sem `GravityField`, −9,81 em y). */
    private gravity(ctx: Ctx): [number, number, number] {
        const a = (
            ctx.bound.slots.gravity?.resource as GravityField | undefined
        )?.uniformAcceleration();
        return [a?.[0] ?? 0, a?.[1] ?? -9.81, a?.[2] ?? 0];
    }

    /** O tempo simulado que o quadro avançou (s): o escoamento da película (sem o `Time`, um passo de 60 Hz). */
    private advancedTime(ctx: Ctx): number {
        const time = ctx.bound.slots.time?.resource as Time | undefined;
        return time === undefined ? 1 / 60 : time.data.steps * time.stepDt;
    }

    /** A simulação avançou neste quadro (sem o `Time` na cena, sempre). */
    private advanced(ctx: Ctx): boolean {
        const time = ctx.bound.slots.time?.resource as Time | undefined;
        return time === undefined || time.data.steps > 0;
    }

    /** Regiões da junção, uma por corpo. */
    private writeDraws(): void {
        const grown = this.draws.reserve(Math.max(1, this.order.length));
        let base = 0;
        const regions = this.order.map((b, i) => {
            const range = this.resources.poolRangeOf(b.poolKey, b.entity);
            const schema = b.body.particleSchema;
            const region = {
                first: range?.first ?? 0,
                strideVec4: schema.stride / 16,
                posOffsetVec4: schema.offsetOf('pos') / 16,
                count: b.body.count,
                base,
                body: i + 1,
                contactOffsetVec4: schema.fields.has('contact')
                    ? schema.offsetOf('contact') / 16
                    : NONE.value,
            };
            base += b.body.count;
            return region;
        });
        const key = JSON.stringify(regions);
        if (!grown && key === this.drawsWritten) return;
        this.drawsWritten = key;
        regions.forEach((region, i) => {
            this.draws.write(i, region);
        });
        this.draws.flush(this.order.length);
    }

    private ensureWork(particles: number, bricks: number): Work {
        const w = this.scratchSize;
        if (w !== undefined && w.particles >= particles && w.bricks === bricks)
            return this.scratch!;
        let cap = Math.max(256, w?.particles ?? 0);
        while (cap < particles) cap *= 2;
        // A C2 realoca os temporários no tamanho novo (o Resource de trabalho se redescreve).
        this.scratchSize = { particles: cap, bricks };
        this.work.work.refresh();
        return this.scratch!;
    }

    /**
     * Os kernels da construção pela C2 e as fontes privadas deles: ligadas de novo quando alguma muda (os temporários
     * redimensionados, a grade refeita, um pool realocado, a película dos sólidos); a C2 refaz os grupos de ligação. Um
     * pipeline da junção por pool de corpos de água.
     */
    private syncKernels(ctx: Ctx, field: FluidField, work: Work): void {
        // Os carimbos e o relógio da série por páginas do atlas (T060f).
        const paged = this.resources.channelOf(field, 'data')?.paged;
        const stamps = paged?.stamps as StorageBufferSpec | undefined;
        const clock = paged?.clock;
        if (stamps === undefined || clock === undefined) return;
        const pools = new Map<string, [StorageBufferSpec, StorageBufferSpec]>();
        for (const b of this.order) {
            const pool = this.resources.poolBufferSpec(b.poolKey);
            const live = this.resources.poolLiveBuffer(b.poolKey);
            if (pool !== undefined && live !== undefined) pools.set(b.poolKey, [pool, live]);
        }
        const sources = new Map<BindingKey, BindingSource>([
            [R.gather, this.draws.source()],
            [R.itemsWrite, work.items],
            [R.contactsWrite, work.contacts],
            [R.items, work.items],
            [R.grid, this.grid.params],
            [R.cellStart, this.grid.cellStart],
            [R.cellCount, this.grid.cellCount],
            [R.cellItems, this.grid.cellItems],
            [R.sorted, work.sorted],
            [R.sortedWrite, work.sorted],
            [R.contacts, work.contacts],
            [R.sortedContacts, work.sortedContacts],
            [R.sortedContactsWrite, work.sortedContacts],
            [R.kernel, work.kernel],
            [R.kernelWrite, work.kernel],
            [R.links, work.links],
            [R.linksWrite, work.links],
            [R.density, work.density],
            [R.densityWrite, work.density],
            [R.phi0, work.phi0],
            [R.flags, work.phiA],
            [R.volumeWrite, this.volume],
            [R.atlasStamps, stamps],
            [R.atlasClock, clock as BindingSource],
            ...[...this.colliderSet.sources()].filter(([r]) => FILM_COLLIDER_RESOURCES.has(r)),
        ]);
        // O mesmo recurso, um temporário por etapa: o filtro, o φ inicial, a eikonal (ida e volta) e a borda.
        const last = FIELD.iterations % 2 === 0 ? work.density : work.phi0;
        const steps: [
            PipelineDescriptor,
            StorageBufferSpec | undefined,
            StorageBufferSpec | undefined,
        ][] = [
            [SMOOTH[0], undefined, work.phiA],
            [SMOOTH[1], work.phiA, work.phi0],
            [SMOOTH[2], work.phi0, work.phiA],
            [INIT, work.phiA, undefined],
            [CLASSIFY, undefined, work.density],
            [FORWARD, work.density, work.phi0],
            [BACKWARD, work.phi0, work.density],
            [APRON, last, undefined],
        ];
        for (const [d, src, dst] of steps) {
            if (src !== undefined) sources.set({ pipeline: d.id, resource: R.src }, src);
            if (dst !== undefined) sources.set({ pipeline: d.id, resource: R.dst }, dst);
        }
        for (const [poolKey, [pool, live]] of pools) {
            const id = gatherKernel(poolKey).id;
            sources.set({ pipeline: id, resource: R.particles }, pool);
            sources.set({ pipeline: id, resource: R.live }, live);
        }
        // Pela identidade do buffer (uma fonte com região é um objeto novo a cada chamada) e a região dele.
        const key = [...sources.values()]
            .map((v) =>
                'buffer' in v
                    ? `${this.identity(v.buffer)}:${v.offset ?? 0}:${v.size ?? 0}`
                    : String(this.identity(v)),
            )
            .join('|');
        if (key !== this.boundKey) {
            this.boundKey = key;
            ctx.bind(sources);
            this.rebuilds = true;
        }
        if (!this.buildPrepared) {
            for (const d of BUILD) ctx.prepare(d);
            this.buildPrepared = true;
        }
        for (const poolKey of pools.keys()) {
            if (this.gatherPools.has(poolKey)) continue;
            this.gatherPools.add(poolKey);
            ctx.prepare(gatherKernel(poolKey));
        }
        for (const poolKey of [...this.gatherPools]) {
            if (pools.has(poolKey)) continue;
            this.gatherPools.delete(poolKey);
            ctx.release(gatherKernel(poolKey).id);
        }
    }

    /** Identidade estável de um objeto de GPU (para saber quando um buffer foi trocado). */
    private identity(o: object | undefined): number {
        if (o === undefined) return -1;
        let id = this.ids.get(o);
        if (id === undefined) this.ids.set(o, (id = this.nextId++));
        return id;
    }
}
