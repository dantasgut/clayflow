import type { BoundFlow, TransitionContext } from '../../scene/flows/FlowBinding';
import type { BindingSource } from '../../scene/flows/FlowBinding';
import type {
    ComputePass,
    EngineCore,
    Frame,
    IndirectBufferSpec,
    StorageBufferSpec,
} from '../../scene/contracts/gpu';
import type { ResourceDirectory } from '../../scene/contracts/ResourceDirectory';
import type { EntityId } from '../../scene/world/EntityId';
import type { World } from '../../scene/world/World';
import { Flow } from '../../scene/flows/Flow';
import type { FlowContext } from '../../scene/flows/FlowRegistry';
import type { FlowTransitions } from '../../scene/flows/FlowTransitions';
import {
    slot,
    type EntitiesSlot,
    type PoolsSlot,
    type SingletonSlot,
    type SlotMap,
} from '../../scene/flows/slots';
import {
    createComputeKernel,
    destroyComputeKernel,
    type ComputeKernel,
} from '../../scene/flows/createComputeKernel';
import type { WgslModule } from '../../scene/shaders/WgslModule';
import type { PipelineDescriptor } from '../../scene/descriptors/PipelineDescriptor';
import type { WgslResource } from '../../scene/shaders/WgslResource';
import { NONE, WORKGROUP_SIZE } from '../../scene/shaders/engineConstants';
import { CountToArgs } from '../gpu/compute/CountToArgs';
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
import { FluidField, fieldDataLayout, fieldFilmOffset, fieldMediaOffset } from './FluidField';
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
}

const slots: FluidFieldSlots = {
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
};

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

/** Kernels do quadro (refeitos quando um buffer muda). */
interface Kernels {
    readonly key: string;
    readonly gather: Map<string, ComputeKernel>;
    /** As partículas na ordem das células (depois da grade). */
    readonly sort: ComputeKernel;
    readonly kernels: ComputeKernel;
    readonly clear: ComputeKernel;
    readonly mark: ComputeKernel;
    /** A película de água nos sólidos (spec 034): o passo por célula (absorção, evaporação, escoamento), deposição. */
    readonly filmStep: ComputeKernel;
    readonly filmDeposit: ComputeKernel;
    readonly links: ComputeKernel;
    readonly density: ComputeKernel;
    /** Filtro separável da densidade: B (ponto fixo) → A → P → A. */
    readonly smooth: readonly ComputeKernel[];
    /** Filtrada (A) → φ inicial (P). */
    readonly init: ComputeKernel;
    /** φ inicial (P) → interface e sinais (A) e a primeira distância (B). */
    readonly classify: ComputeKernel;
    /** Iterações da eikonal B → P e P → B. */
    readonly forward: ComputeKernel;
    readonly backward: ComputeKernel;
    readonly apron: ComputeKernel;
    /** A malha da superfície (spec 039 refeita): a extração por bloco e os argumentos do desenho. */
    readonly mesh: ComputeKernel;
    readonly meshArgs: ComputeKernel;
}

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
    readonly slots = slots;
    protected readonly initialState = 'idle' as const;
    protected readonly transitions: FlowTransitions<'idle', Ctx>;

    private readonly core: EngineCore;
    private readonly resources: ResourceDirectory;
    private readonly world: World;
    private readonly bodies = new Map<EntityId, FieldBody>();
    private readonly draws: PerStepUniforms;
    private readonly grid: SpatialHashGrid;
    /** Volume do campo somado no quadro (lido pela limpeza do seguinte: o nível que conserva o volume). */
    private readonly volume: StorageBufferSpec;
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
    private work: Work | undefined;
    private kernels: Kernels | undefined;
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
        this.wave = new RayWave(ctx.core, 'field');
        this.core = ctx.core;
        this.resources = ctx.resources;
        this.world = ctx.world;
        this.draws = new PerStepUniforms(ctx.core, {
            discriminator: 'field_gather',
            schema: FieldGatherSchema,
        });
        this.draws.reserve(1);
        this.grid = new SpatialHashGrid(ctx.core, {
            discriminator: 'field_grid',
            label: 'FluidFieldFlow.grid',
        });
        this.args = new CountToArgs(ctx.core, { discriminator: 'field_args' });
        this.colliderSet = new ColliderSet(ctx.core, ctx.world, ctx.resources, {
            discriminator: 'field_colliders',
        });
        this.volume = ctx.core.create<StorageBufferSpec>({
            kind: 'buffer',
            subkind: 'storage',
            discriminator: 'field_volume',
            byteSize: 16,
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
        const k = this.kernels;
        const work = this.work;
        const field = this.field;
        const counts = field === undefined ? undefined : this.counts(field);
        if (!this.active || k === undefined || work === undefined || counts === undefined) return;
        if (this.rebuilds) this.rebuild(frame, k, work, field!, counts);
        this.rebuilds = false;
        this.dispatchClosures(frame, bound);
        this.dispatchLightMap(frame, bound);
    }

    /** A construção do campo pelas partículas: a junção, a grade, os núcleos, os blocos, a distância e a malha. */
    private rebuild(
        frame: Frame,
        k: Kernels,
        work: Work,
        field: FluidField,
        counts: IndirectBufferSpec,
    ): void {
        const W = WORKGROUP_SIZE.value;
        frame.compute('FluidFieldFlow.gather', (pass) => {
            this.order.forEach((b, i) => {
                const kernel = k.gather.get(b.poolKey);
                if (kernel === undefined) return;
                pass.bind.setPipeline(kernel.pipeline);
                kernel.bindTo(pass.bind, { draw: [this.draws.offset(i)] });
                pass.dispatch.invocations(b.body.count, W);
            });
        });
        this.grid.record(frame);
        const table = field.capacity.table;
        frame.compute('FluidFieldFlow.kernels', (pass) => {
            this.run(pass, k.sort, this.particles, W);
            this.run(pass, k.kernels, this.particles, W);
        });
        frame.compute('FluidFieldFlow.mark', (pass) => {
            this.run(pass, k.clear, table + 1, W);
            this.run(pass, k.mark, this.particles, W);
            this.run(pass, k.links, work.bricks, W);
        });
        // A película de água nos sólidos (spec 034): só nos quadros em que a simulação avança (parada, fica).
        if (this.filmAdvances) {
            frame.compute('FluidFieldFlow.film', (pass) => {
                this.run(pass, k.filmStep, FIELD_FILM_CELLS, W);
                this.run(pass, k.filmDeposit, this.particles, W);
            });
        }
        this.args.record(frame, { counts, index: 0, workgroupSize: 1 });
        // A densidade é somada em ponto fixo: o buffer (também o segundo do redistanciamento) começa zerado.
        frame.clear(work.density);
        frame.compute('FluidFieldFlow.density', (pass) => {
            this.run(pass, k.density, this.particles, W);
        });
        const indirect = (label: string, kernels: readonly ComputeKernel[]): void => {
            frame.compute(label, (pass) => {
                for (const kernel of kernels) {
                    pass.bind.setPipeline(kernel.pipeline);
                    kernel.bindTo(pass.bind);
                    pass.dispatch.workgroupsIndirect(counts, SET_COUNT_DISPATCH_OFFSET);
                }
            });
        };
        indirect('FluidFieldFlow.smooth', k.smooth);
        indirect('FluidFieldFlow.init', [k.init, k.classify]);
        indirect(
            'FluidFieldFlow.redistance',
            Array.from({ length: FIELD.iterations }, (_, n) =>
                n % 2 === 0 ? k.forward : k.backward,
            ),
        );
        indirect('FluidFieldFlow.apron', [k.apron]);
        // A malha da superfície: a contagem zerada, um grupo por bloco, os argumentos do desenho.
        const meshArgs = this.counts(field, 'meshArgs');
        if (meshArgs !== undefined) frame.clear(meshArgs, 16, 4);
        frame.compute('FluidFieldFlow.mesh', (pass) => {
            pass.bind.setPipeline(k.mesh.pipeline);
            k.mesh.bindTo(pass.bind);
            pass.dispatch.workgroupsIndirect(counts, SET_COUNT_DISPATCH_OFFSET);
            this.run(pass, k.meshArgs, 1, 1);
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

    /** Libera buffers e kernels. */
    override dispose(): void {
        this.releaseKernels();
        this.releaseWork();
        this.grid.destroy();
        this.colliderSet.destroy();
        this.core.destroy(this.volume);
        this.draws.dispose();
        this.wave.destroy();
    }

    private run(pass: ComputePass, kernel: ComputeKernel, count: number, size: number): void {
        if (count <= 0) return;
        pass.bind.setPipeline(kernel.pipeline);
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
                limits: [FIELD.neighbors, 32, layout.bricks, layout.voxels],
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
        this.ensureKernels(field, work, counts, data, gridRebuilt);
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
        const w = this.work;
        if (w !== undefined && w.particles >= particles && w.bricks === bricks) return w;
        this.releaseKernels();
        this.releaseWork();
        let cap = Math.max(256, w?.particles ?? 0);
        while (cap < particles) cap *= 2;
        const storage = (name: string, bytes: number): StorageBufferSpec =>
            this.core.create<StorageBufferSpec>({
                kind: 'buffer',
                subkind: 'storage',
                discriminator: `field_${name}`,
                byteSize: Math.max(16, bytes),
            });
        this.work = {
            particles: cap,
            bricks,
            items: storage('items', cap * 16),
            sorted: storage('sorted', cap * 16),
            contacts: storage('contacts', cap * 16),
            sortedContacts: storage('sorted_contacts', cap * 16),
            kernel: storage('kernel', cap * 48),
            links: storage('links', bricks * 28 * 4),
            density: storage('density', bricks * FIELD_BRICK_VOXELS * 4),
            phi0: storage('phi0', bricks * FIELD_BRICK_VOXELS * 4),
            phiA: storage('phi_a', bricks * FIELD_BRICK_VOXELS * 4),
        };
        return this.work;
    }

    /** Kernels com os buffers atuais (refeitos quando algum muda). */
    private ensureKernels(
        field: FluidField,
        work: Work,
        counts: IndirectBufferSpec,
        data: StorageBufferSpec,
        gridRebuilt: boolean,
    ): void {
        const mesh = this.buffer(field, 'mesh');
        const meshArgs = this.counts(field, 'meshArgs');
        if (mesh === undefined || meshArgs === undefined) return;
        const pools = this.order.map(
            (b) => `${b.poolKey}:${this.identity(this.resources.poolBufferSpec(b.poolKey))}`,
        );
        const key = [work.items, data, counts, mesh, meshArgs]
            .map((b) => String(this.identity(b)))
            .concat([
                String(this.draws.generation),
                `colliders:${this.colliderSet.generation}`,
                ...pools,
            ])
            .join('|');
        if (this.kernels?.key === key && !gridRebuilt) return;
        this.releaseKernels();
        const params = this.resources.bufferOf(field, 'params') as BindingSource;
        const gridSources: [WgslResource, BindingSource][] = [
            [R.grid, this.grid.params],
            [R.cellStart, this.grid.cellStart],
            [R.cellCount, this.grid.cellCount],
        ];
        const make = (
            name: string,
            shader: WgslModule,
            entryPoint: string,
            sources: [WgslResource, BindingSource][],
        ): ComputeKernel =>
            createComputeKernel(this.core, {
                discriminator: `field:${name}`,
                shader,
                entryPoint,
                bindings: new Map<WgslResource, BindingSource>([[R.params, params], ...sources]),
            });
        const gather = new Map<string, ComputeKernel>();
        for (const b of this.order) {
            if (gather.has(b.poolKey)) continue;
            const pool = this.resources.poolBufferSpec(b.poolKey);
            const live = this.resources.poolLiveBuffer(b.poolKey);
            if (pool === undefined || live === undefined) continue;
            gather.set(
                b.poolKey,
                createComputeKernel(this.core, {
                    discriminator: `field:gather:${b.poolKey}`,
                    shader: fieldGather,
                    entryPoint: 'field_gather_main',
                    bindings: new Map<WgslResource, BindingSource>([
                        [R.gather, this.draws.source()],
                        [R.particles, pool],
                        [R.live, live],
                        [R.itemsWrite, work.items],
                        [R.contactsWrite, work.contacts],
                    ]),
                }),
            );
        }
        const eikonal = (
            src: StorageBufferSpec,
            dst: StorageBufferSpec,
            name: string,
        ): ComputeKernel =>
            make(name, fieldRedistance, 'field_eikonal_main', [
                [R.counts, counts],
                [R.links, work.links],
                [R.flags, work.phiA],
                [R.src, src],
                [R.dst, dst],
            ]);
        this.kernels = {
            key,
            gather,
            sort: make('sort', fieldSort, 'field_sort_main', [
                ...gridSources,
                [R.cellItems, this.grid.cellItems],
                [R.items, work.items],
                [R.sortedWrite, work.sorted],
                [R.contacts, work.contacts],
                [R.sortedContactsWrite, work.sortedContacts],
            ]),
            kernels: make('kernels', fieldKernels, 'field_kernels_main', [
                ...gridSources,
                [R.sorted, work.sorted],
                [R.kernelWrite, work.kernel],
                [R.sortedContacts, work.sortedContacts],
            ]),
            clear: make('clear', fieldMark, 'field_clear_main', [
                [R.dataAtomic, data],
                [R.countsWrite, counts],
                [R.volumeWrite, this.volume],
            ]),
            mark: make('mark', fieldMark, 'field_mark_main', [
                [R.sorted, work.sorted],
                [R.kernel, work.kernel],
                [R.dataAtomic, data],
                [R.countsWrite, counts],
            ]),
            filmStep: make('film_step', fieldFilmStep, 'field_film_step_main', [
                [R.dataAtomic, data],
                ...[...this.colliderSet.sources()].filter(([r]) => FILM_COLLIDER_RESOURCES.has(r)),
            ]),
            filmDeposit: make('film_deposit', fieldFilmDeposit, 'field_film_deposit_main', [
                [R.sorted, work.sorted],
                [R.sortedContacts, work.sortedContacts],
                [R.kernel, work.kernel],
                [R.dataAtomic, data],
            ]),
            links: make('links', fieldLinks, 'field_links_main', [
                [R.data, data],
                [R.counts, counts],
                [R.linksWrite, work.links],
            ]),
            density: make('density', fieldDensity, 'field_density_main', [
                [R.data, data],
                [R.sorted, work.sorted],
                [R.kernel, work.kernel],
                [R.densityWrite, work.density],
            ]),
            smooth: [
                make('smooth_x', fieldRedistance, 'field_smooth_x_main', [
                    [R.counts, counts],
                    [R.links, work.links],
                    [R.density, work.density],
                    [R.dst, work.phiA],
                ]),
                make('smooth_y', fieldRedistance, 'field_smooth_y_main', [
                    [R.counts, counts],
                    [R.links, work.links],
                    [R.src, work.phiA],
                    [R.dst, work.phi0],
                ]),
                make('smooth_z', fieldRedistance, 'field_smooth_z_main', [
                    [R.counts, counts],
                    [R.links, work.links],
                    [R.src, work.phi0],
                    [R.dst, work.phiA],
                ]),
            ],
            init: make('init', fieldRedistance, 'field_init_main', [
                [R.counts, counts],
                [R.links, work.links],
                [R.src, work.phiA],
                [R.phi0, work.phi0],
                [R.data, data],
            ]),
            classify: make('classify', fieldRedistance, 'field_classify_main', [
                [R.counts, counts],
                [R.links, work.links],
                [R.phi0, work.phi0],
                [R.flags, work.phiA],
                [R.dst, work.density],
            ]),
            forward: eikonal(work.density, work.phi0, 'eikonal_bp'),
            backward: eikonal(work.phi0, work.density, 'eikonal_pb'),
            apron: make('apron', fieldApron, 'field_apron_main', [
                [R.counts, counts],
                [R.links, work.links],
                [R.src, FIELD.iterations % 2 === 0 ? work.density : work.phi0],
                [R.dataVoxels, data],
                [R.volumeWrite, this.volume],
            ]),
            mesh: make('mesh', fieldMesh, 'field_mesh_main', [
                [R.data, data],
                [R.counts, counts],
                [R.meshOut, mesh],
                [R.meshArgs, meshArgs],
            ]),
            meshArgs: createComputeKernel(this.core, {
                discriminator: 'field:mesh_args',
                shader: fieldMesh,
                entryPoint: 'field_mesh_args_main',
                bindings: new Map<WgslResource, BindingSource>([
                    [R.meshOut, mesh],
                    [R.meshArgs, meshArgs],
                ]),
            }),
        };
    }

    /** Identidade estável de um objeto de GPU (para saber quando um buffer foi trocado). */
    private identity(o: object | undefined): number {
        if (o === undefined) return -1;
        let id = this.ids.get(o);
        if (id === undefined) this.ids.set(o, (id = this.nextId++));
        return id;
    }

    private releaseKernels(): void {
        const k = this.kernels;
        if (k === undefined) return;
        for (const kernel of k.gather.values()) destroyComputeKernel(this.core, kernel);
        for (const kernel of [
            k.sort,
            k.kernels,
            k.clear,
            k.mark,
            k.filmStep,
            k.filmDeposit,
            k.links,
            k.density,
            ...k.smooth,
            k.init,
            k.classify,
            k.forward,
            k.backward,
            k.apron,
            k.mesh,
            k.meshArgs,
        ])
            destroyComputeKernel(this.core, kernel);
        this.kernels = undefined;
    }

    private releaseWork(): void {
        const w = this.work;
        if (w === undefined) return;
        for (const b of [
            w.items,
            w.sorted,
            w.contacts,
            w.sortedContacts,
            w.kernel,
            w.links,
            w.density,
            w.phi0,
            w.phiA,
        ])
            this.core.destroy(b);
        this.work = undefined;
    }
}
