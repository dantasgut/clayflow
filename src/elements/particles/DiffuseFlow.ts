import type { EngineCore, Frame, StorageBufferSpec } from '../../scene/contracts/gpu';
import type { ResourceDirectory } from '../../scene/contracts/ResourceDirectory';
import { Flow } from '../../scene/flows/Flow';
import type {
    BindingSources,
    BoundFlow,
    PreparedCompute,
    TransitionContext,
} from '../../scene/flows/FlowBinding';
import type { FlowContext } from '../../scene/flows/FlowRegistry';
import type { FlowTransitions } from '../../scene/flows/FlowTransitions';
import {
    slot,
    type EntitiesSlot,
    type PoolsSlot,
    type SingletonSlot,
    type SlotMap,
} from '../../scene/flows/slots';
import { Time } from '../../scene/time/Time';
import type { EntityId } from '../../scene/world/EntityId';
import { PerStepUniforms } from '../gpu/compute/PerStepUniforms';
import { PrefixSum } from '../gpu/compute/PrefixSum';
import {
    NEIGHBOR_SEARCH_MAX_PARTICLES,
    NeighborSearchPipeline,
} from '../gpu/NeighborSearchPipeline';
import { PointCloudGeometry } from '../geometry/PointCloudGeometry';
import { LCPSchema } from '../physics/bodies/schemas/LCPSchema';
import { Collider } from '../physics/colliders/Collider';
import { COLLIDER_POOL_KEYS, ColliderSet } from '../physics/colliders/ColliderSet';
import { GravityField } from '../physics/forcefields/GravityField';
import { ParticleMaterial } from '../physics/materials/ParticleMaterial';
import { diffuseCollide, diffuseSpawn, diffuseUpdate } from '../physics/shaders/diffuse';
import { DiffuseParticles } from './DiffuseParticles';
import { DiffuseParamsSchema } from './DiffuseSchemas';

const WORKGROUP = 64;
/** Vizinhos lidos por partícula do fluido nos potenciais. */
const MAX_NEIGHBORS = 64;

/** Slots do estágio das partículas secundárias. */
export interface DiffuseSlots extends SlotMap {
    /** Partículas secundárias com a nuvem de pontos onde são desenhadas (o estágio escreve os vértices). */
    readonly diffuse: EntitiesSlot;
    /** Relógio da cena. */
    readonly time: SingletonSlot<false>;
    /** Gravidade uniforme (opcional; padrão −9,81 em y). */
    readonly gravity: SingletonSlot<true>;
    /** Material das partículas do fluido (espaçamento, domínio). */
    readonly material: SingletonSlot<true>;
    /** Pools dos colliders e dos corpos donos (o spray colide com os sólidos da cena). */
    readonly colliderPools: PoolsSlot;
    /** Entidades com collider. */
    readonly colliders: EntitiesSlot;
}

const slots: DiffuseSlots = {
    diffuse: slot.entities({
        all: [DiffuseParticles, PointCloudGeometry],
        owns: [[PointCloudGeometry, 'vertices']],
    }),
    time: slot.singleton(Time.schema),
    gravity: slot.singleton(GravityField.schema, { optional: true }),
    material: slot.singleton(ParticleMaterial.schema, { optional: true }),
    colliderPools: slot.pools([...COLLIDER_POOL_KEYS, LCPSchema.name]),
    colliders: slot.entities({ all: [Collider] }),
};

type Ctx = TransitionContext<DiffuseSlots>;

/** Passadas da geração (entradas do `diffuse_spawn.wgsl`). */
const SPAWN_ENTRIES = ['normals', 'potential', 'spawn', 'head'] as const;

/** Estado de uma entidade de partículas secundárias. */
interface DiffuseState {
    readonly id: EntityId;
    readonly params: PerStepUniforms;
    readonly search: NeighborSearchPipeline;
    readonly scan: PrefixSum;
    readonly normals: StorageBufferSpec;
    readonly counts: StorageBufferSpec;
    readonly offsets: StorageBufferSpec;
    readonly state: StorageBufferSpec;
    /** Grade da busca (recriada quando o material muda). */
    gridKey: string;
    /** Pool do fluido ligado (detecta realocação). */
    pool: StorageBufferSpec | undefined;
    /** Passos do quadro corrente (0: nada). */
    steps: number;
    /** Partículas do fluido no pool no quadro corrente. */
    fluidCount: number;
}

/**
 * DiffuseFlow — partículas secundárias dos fluidos de partículas (spec 010; Ihmsen et al. 2012). Para cada
 * `DiffuseParticles`, depois do solver do fluido: a busca de vizinhos própria sobre o pool do fluido; normais de
 * superfície; potenciais (ar aprisionado, crista, energia cinética) e o número de partículas a gerar por partícula do
 * fluido; soma de prefixos e criação no anel em lugares determinísticos; depois, por passo fixo, a classificação pela
 * vizinhança e a dinâmica de spray, espuma e bolha, a colisão com os colliders e os vértices do desenho.
 *
 * Usa o estado do fluido no fim do quadro (o solver roda os seus passos antes): a quantidade e o lugar das
 * partículas geradas dependem da taxa de quadros — detalhe visual, fora das trajetórias do fluido.
 */
export class DiffuseFlow extends Flow<DiffuseSlots, 'idle'> {
    readonly type = 'DiffuseFlow';
    readonly slots = slots;
    protected readonly initialState = 'idle' as const;
    protected readonly transitions: FlowTransitions<'idle', Ctx>;

    private readonly core: EngineCore;
    private readonly resources: ResourceDirectory;
    private readonly states = new Map<EntityId, DiffuseState>();
    private readonly colliderSet: ColliderSet;
    private dirty = true;
    private frame = 0;

    constructor(ctx: FlowContext) {
        super();
        this.core = ctx.core;
        this.resources = ctx.resources;
        this.colliderSet = new ColliderSet(ctx.core, ctx.world, ctx.resources, {
            discriminator: 'diffuse_colliders',
        });
        const changed = {
            to: 'idle' as const,
            run: (e: { type: string; poolKey?: string }): void => {
                this.dirty = true;
                this.colliderSet.markDirty();
                if (e.type === 'poolReallocated' && e.poolKey !== undefined)
                    this.colliderSet.onPoolReallocated(e.poolKey);
            },
        };
        this.transitions = {
            '*': {
                slotsResolved: changed,
                slotLost: changed,
                slotChanged: changed,
                entitiesChanged: changed,
                poolReallocated: changed,
                bindGroupReplaced: 'ignore',
                pipelinesCompiled: 'ignore',
                framePrepare: {
                    to: 'idle',
                    run: (_e, c) => {
                        if (this.colliderSet.refresh()) c.bind(this.colliderSet.sources());
                        this.sync(c);
                        this.writeParams(c);
                    },
                },
            },
        };
    }

    /** Geração uma vez por quadro e um passo de dinâmica por passo fixo, por entidade. */
    dispatch(frame: Frame, bound: BoundFlow<DiffuseSlots>): void {
        for (const st of this.states.values()) {
            if (st.steps === 0 || st.fluidCount === 0) continue;
            const entry = bound.slots.diffuse.entry(st.id);
            if (entry === undefined) continue;
            const capacity = entry.get(DiffuseParticles).data.maxParticles;
            const p = (name: string): PreparedCompute | undefined => {
                const x = bound.pipelines.get(`diffuse_${name}:${st.id}`);
                return x?.role === 'compute' && x.ready ? x : undefined;
            };
            const spawn = SPAWN_ENTRIES.map(p);
            const update = p('update');
            const collide = p('collide');
            if (spawn.some((x) => x === undefined) || update === undefined || collide === undefined)
                continue;
            const [normals, potential, create, head] = spawn as PreparedCompute[];
            const run = (
                label: string,
                k: PreparedCompute,
                region: number,
                count: number | 'one',
            ) => {
                frame.compute(label, (pass) => {
                    pass.bind.setPipeline(k.spec);
                    k.groups.forEach((bg, g) =>
                        pass.bind.setBindGroup(
                            g,
                            bg,
                            k.dynamic[g] ? [st.params.offset(region)] : undefined,
                        ),
                    );
                    if (count === 'one') pass.dispatch.workgroups(1);
                    else pass.dispatch.invocations(count, WORKGROUP);
                });
            };
            st.search.rebuild(frame, st.fluidCount);
            run('DiffuseFlow.normals', normals!, 0, st.fluidCount);
            run('DiffuseFlow.potential', potential!, 0, st.fluidCount);
            st.scan.record(frame, { src: st.counts, dst: st.offsets, count: st.fluidCount });
            run('DiffuseFlow.spawn', create!, 0, st.fluidCount);
            run('DiffuseFlow.head', head!, 0, 'one');
            for (let k = 0; k < st.steps; k++) {
                run('DiffuseFlow.update', update, 1 + k, capacity);
                run('DiffuseFlow.collide', collide, 1 + k, capacity);
            }
        }
    }

    /** Libera os recursos de cada entidade e o conjunto de colliders. */
    override dispose(): void {
        for (const st of this.states.values()) this.destroyState(st);
        this.states.clear();
        this.colliderSet.destroy();
    }

    private destroyState(st: DiffuseState): void {
        st.params.dispose();
        st.search.dispose();
        st.scan.destroy();
        for (const b of [st.normals, st.counts, st.offsets, st.state]) this.core.destroy(b);
    }

    /** Entidades presentes: estado, busca de vizinhos sobre o pool do fluido, bindings e pipelines. */
    private sync(ctx: Ctx): void {
        if (!this.dirty) return;
        this.dirty = false;
        const material =
            (ctx.bound.slots.material?.resource as ParticleMaterial | undefined)
            ?? ParticleMaterial.defaults;
        const h = 2 * material.particleSpacing;
        const grid = material.gridFor(h);
        const gridKey = `${grid.cellSize}|${grid.gridDim.join(',')}|${grid.origin.join(',')}`;
        const present = new Set<EntityId>();
        for (const entry of ctx.bound.slots.diffuse.entries) {
            const id = entry.entityId;
            present.add(id);
            const diffuse = entry.get(DiffuseParticles);
            const particles = this.resources.bufferOf(diffuse, 'particles');
            const vertices = this.resources.bufferOf(entry.get(PointCloudGeometry), 'vertices');
            const schema = diffuse.source.particleSchema;
            const pool = this.resources.poolBufferSpec(schema.name);
            const live = this.resources.poolLiveBuffer(schema.name);
            if (
                particles?.subkind !== 'storage'
                || vertices?.subkind !== 'vertex'
                || pool === undefined
                || live === undefined
            )
                continue;
            let st = this.states.get(id);
            if (st !== undefined && st.gridKey !== gridKey) {
                this.releasePipelines(ctx, id);
                this.destroyState(st);
                this.states.delete(id);
                st = undefined;
            }
            if (st === undefined) {
                st = this.createState(id, schema.stride / 4, grid, gridKey);
                this.states.set(id, st);
            }
            st.search.prepare(pool, live, 1);
            st.scan.prepare(st.offsets, 1);
            st.pool = pool;
            const g = st.search.grid!;
            const shared: BindingSources = {
                diffuse_params: st.params.source(),
                fluid: pool,
                fluid_live: live,
                neighbor_list: st.search.neighborList!,
                neighbor_count: st.search.neighborCount!,
                diffuse_normals: st.normals,
                diffuse_counts: st.counts,
                diffuse_offsets: st.offsets,
                diffuse: particles,
                diffuse_state: st.state,
                cell_start: g.cellStart,
                cell_count: g.cellCount,
                sorted_particles: g.sortedParticles,
                diffuse_vertices: vertices,
            };
            const prepare = (name: string, shader: typeof diffuseSpawn, entry: string): void => {
                const pid = `diffuse_${name}:${id}`;
                const sources: Record<string, unknown> = {};
                for (const [k, v] of Object.entries(shared)) sources[`${pid}:${k}`] = v;
                ctx.bind(sources as BindingSources);
                ctx.prepare({
                    id: pid,
                    role: 'compute',
                    shader,
                    entryPoints: [entry],
                    consumes: [],
                });
            };
            for (const e of SPAWN_ENTRIES) prepare(e, diffuseSpawn, `diffuse_${e}_main`);
            prepare('update', diffuseUpdate, 'diffuse_update_main');
            prepare('collide', diffuseCollide, 'diffuse_collide_main');
        }
        for (const [id, st] of [...this.states]) {
            if (present.has(id)) continue;
            this.releasePipelines(ctx, id);
            this.destroyState(st);
            this.states.delete(id);
        }
    }

    private createState(
        id: EntityId,
        strideF32: number,
        grid: ReturnType<ParticleMaterial['gridFor']>,
        gridKey: string,
    ): DiffuseState {
        const storage = (name: string, bytes: number): StorageBufferSpec =>
            this.core.create<StorageBufferSpec>({
                kind: 'buffer',
                subkind: 'storage',
                discriminator: `diffuse_${name}:${id}:${gridKey}`,
                byteSize: bytes,
            });
        const search = new NeighborSearchPipeline(this.core, {
            discriminator: `diffuse:${id}:${gridKey}`,
            maxParticles: NEIGHBOR_SEARCH_MAX_PARTICLES,
            maxNeighbors: MAX_NEIGHBORS,
            particleStrideF32: strideF32,
            cellSize: grid.cellSize,
            gridDim: grid.gridDim,
            origin: grid.origin,
        });
        search.allocate();
        const params = new PerStepUniforms(this.core, {
            discriminator: `diffuse_params:${id}:${gridKey}`,
            schema: DiffuseParamsSchema,
        });
        params.reserve(1 + 4);
        return {
            id,
            params,
            search,
            scan: new PrefixSum(this.core, {
                discriminator: `diffuse_scan:${id}:${gridKey}`,
                capacity: NEIGHBOR_SEARCH_MAX_PARTICLES,
            }),
            normals: storage('normals', NEIGHBOR_SEARCH_MAX_PARTICLES * 16),
            counts: storage('counts', NEIGHBOR_SEARCH_MAX_PARTICLES * 4),
            offsets: storage('offsets', NEIGHBOR_SEARCH_MAX_PARTICLES * 4),
            state: storage('state', 16),
            gridKey,
            pool: undefined,
            steps: 0,
            fluidCount: 0,
        };
    }

    private releasePipelines(ctx: Ctx, id: EntityId): void {
        for (const e of [...SPAWN_ENTRIES, 'update', 'collide']) ctx.release(`diffuse_${e}:${id}`);
    }

    /** Parâmetros do quadro: geração (região 0, passo do quadro) e um passo de dinâmica por passo fixo. */
    private writeParams(ctx: Ctx): void {
        const { diffuse, time, gravity } = ctx.bound.slots;
        const clock = time.resource as Time;
        const material =
            (ctx.bound.slots.material?.resource as ParticleMaterial | undefined)
            ?? ParticleMaterial.defaults;
        const g = (gravity?.resource as GravityField | undefined)?.uniformAcceleration() ?? [
            0, -9.81, 0, 0,
        ];
        this.frame++;
        for (const st of this.states.values()) {
            st.steps = 0;
            const entry = diffuse.entry(st.id);
            if (entry === undefined) continue;
            const d = entry.get(DiffuseParticles);
            const schema = d.source.particleSchema;
            st.fluidCount = Math.min(
                this.resources.poolCount(schema.name),
                NEIGHBOR_SEARCH_MAX_PARTICLES,
            );
            st.steps = clock.steps;
            if (st.steps === 0 || st.fluidCount === 0) continue;
            if (st.params.reserve(1 + st.steps)) this.dirty = true;
            const grid = st.search.grid!;
            const data = d.data;
            const s = material.particleSpacing;
            const base = {
                fluid_count: st.fluidCount,
                fluid_stride: schema.stride / 4,
                pos_offset: schema.offsetOf('pos') / 4,
                vel_offset: schema.offsetOf('vel') / 4,
                max_neighbors: MAX_NEIGHBORS,
                list_stride: NEIGHBOR_SEARCH_MAX_PARTICLES,
                capacity: data.maxParticles,
                frame: this.frame,
                grid_x: grid.gridDim[0],
                grid_y: grid.gridDim[1],
                grid_z: grid.gridDim[2],
                spray_max: data.sprayNeighbors,
                grid_origin: [...grid.origin],
                cell_size: grid.cellSize,
                gravity: [g[0] ?? 0, g[1] ?? -9.81, g[2] ?? 0],
                dt: clock.stepDt * st.steps,
                bound_min: material.domainMin,
                h: 2 * s,
                bound_max: material.domainMax,
                bubble_min: data.bubbleNeighbors,
                ta_min: data.trappedAir[0],
                ta_max: data.trappedAir[1],
                wc_min: data.waveCrest[0],
                wc_max: data.waveCrest[1],
                k_min: data.kinetic[0],
                k_max: data.kinetic[1],
                k_ta: data.trappedAirRate,
                k_wc: data.waveCrestRate,
                lifetime: data.lifetime,
                air_drag: data.airDrag,
                buoyancy: data.buoyancy,
                bubble_drag: data.bubbleDrag,
                spawn_radius: 0.5 * s,
                spawn_spread: 0.1,
                spray_aging: data.sprayAging,
                time: clock.simulated,
            };
            st.params.write(0, base);
            for (let k = 0; k < st.steps; k++)
                st.params.write(1 + k, {
                    ...base,
                    dt: clock.stepDt,
                    time: clock.stepTime(k) + clock.stepDt,
                });
            st.params.flush(1 + st.steps);
        }
        if (this.dirty) this.sync(ctx);
    }
}
