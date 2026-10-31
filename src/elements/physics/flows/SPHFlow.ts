import type { ComputePass, Frame } from '../../../scene/contracts/gpu';
import type { PipelineDescriptor } from '../../../scene/descriptors/PipelineDescriptor';
import { StructSchema } from '../../../scene/descriptors/StructSchema';
import { Flow } from '../../../scene/flows/Flow';
import { FlowWork, type WorkContext } from '../../../scene/flows/FlowWork';
import type {
    BindingSource,
    BoundFlow,
    PreparedCompute,
    TransitionContext,
} from '../../../scene/flows/FlowBinding';
import type { FlowContext } from '../../../scene/flows/FlowRegistry';
import type { FlowTransitions } from '../../../scene/flows/FlowTransitions';
import {
    slot,
    type BodiesSlot,
    type EntitiesSlot,
    type PoolSlot,
    type PoolsSlot,
    type SingletonSlot,
    type SlotMap,
    type WorkSlot,
} from '../../../scene/flows/slots';
import { WORKGROUP_SIZE } from '../../../scene/shaders/engineConstants';
import type { WgslResource } from '../../../scene/shaders/WgslResource';
import { Time } from '../../../scene/time/Time';
import {
    NEIGHBOR_SEARCH_MAX_PARTICLES,
    NeighborSearchPipeline,
} from '../../gpu/NeighborSearchPipeline';
import { LCPSchema } from '../bodies/schemas/LCPSchema';
import { Collider } from '../colliders/Collider';
import { COLLIDER_POOL_KEYS, ColliderSet } from '../colliders/ColliderSet';
import { GravityField } from '../forcefields/GravityField';
import { ParticlePhysics, TAIT_GAMMA, type SurfaceStep } from '../ParticlePhysics';
import { SPHSchema } from '../bodies/schemas/SPHSchema';
import { SPHBoundarySchema, SPHNormalSchema } from '../bodies/schemas/fluidWork';
import { SPHSimParamsSchema } from '../schemas/simParams';
import {
    sphBoundary,
    sphCollision,
    sphDensity,
    sphForces,
    sphIntegrate,
    sphNormals,
    sphPressure,
    sphResources,
} from '../shaders/sph';
import { PerStepUniforms } from '../../gpu/compute/PerStepUniforms';

/** Opções do `SPHFlow`. */
export interface SPHFlowOptions {
    /** Mínimo de substeps por passo (padrão 1); o passo estável do `ParticlePhysics` pode exigir mais. */
    readonly substeps?: number;
    /** Vizinhos guardados por partícula (padrão 128; o suporte 2h tem ~73 vizinhos em repouso). */
    readonly maxNeighbors?: number;
}

/** Slots do SPH. */
export interface SPHSlots extends SlotMap {
    /** Pool de corpos do `bodyType` do registro. */
    readonly bodies: BodiesSlot;
    /** Relógio da cena (passos fixos do quadro). */
    readonly time: SingletonSlot<false>;
    /** Campo de gravidade (opcional; padrão `[0, −9,81, 0]`). */
    readonly gravity: SingletonSlot<true>;
    /** Comportamento das partículas (opcional; padrões do solver). */
    readonly physics: SingletonSlot<true>;
    /** Pools de colliders e de corpos rígidos (cada um presente ou não). */
    readonly colliderPools: PoolsSlot;
    /** Entidades com collider (donos dos registros nos pools de collider). */
    readonly colliders: EntitiesSlot;
    /** Normais de superfície por partícula (pool do corpo, mesmo slot; tensão superficial de Akinci, spec 030). */
    readonly normals: PoolSlot<false>;
    /** Fronteira sólida por partícula (pool do corpo, mesmo slot; Σ −B' n, Σ B; Akinci et al. 2012). */
    readonly boundary: PoolSlot<false>;
    /** O espaço de trabalho do solver: parâmetros por iteração, vizinhança, colliders (spec 039). */
    readonly work: WorkSlot<SPHWork>;
}

/** Resource de trabalho do `SPHFlow` (spec 039). */
class SPHWork extends FlowWork {
    static readonly schema = new StructSchema('SPHWork', {});
}

type Ctx = TransitionContext<SPHSlots>;

/**
 * SPHFlow — fluidos por Smoothed Particle Hydrodynamics fracamente compressível (Tait). O quadro executa
 * `time.steps × substeps` iterações, com `substeps` pelo passo estável do `ParticlePhysics` (CFL 0,4 h/c); cada
 * uma reconstrói a vizinhança (raio = suporte 2h) e roda densidade → pressão → forças → integração → colisão com a
 * sua região de `SPHSimParams` (`dt = stepDt / substeps`, `dt_frame = stepDt`) ligada por offset dinâmico. Massa,
 * suavização, rigidez, viscosidade, restituição e domínio vêm da física.
 *
 * O espaço de trabalho — parâmetros por iteração, busca de vizinhança (recriada quando a grade da física muda) e
 * `ColliderSet` — é do Resource de trabalho (`SPHWork`); as normais e a fronteira por partícula são pools do próprio
 * corpo (spec 039). Tudo é preparado e religado em transições (`framePrepare`, entidades e pools de collider), nunca no
 * `dispatch`.
 */
export class SPHFlow extends Flow<SPHSlots, 'running'> {
    readonly type = 'SPHFlow';
    readonly slots: SPHSlots;
    override readonly pipelines: readonly PipelineDescriptor[];
    protected readonly initialState = 'running' as const;
    protected readonly transitions: FlowTransitions<'running', TransitionContext<SPHSlots>>;

    private readonly work: WorkContext;
    private readonly minSubsteps: number;
    private readonly maxNeighbors: number;
    private readonly params: PerStepUniforms;
    private readonly colliderSet: ColliderSet;
    /** Coesão > 0 no quadro corrente: grava o passe de normais (decidido em `framePrepare`). */
    private cohesionOn = false;
    /** Materiais já avisados de coesão/adesão grampeadas. */
    private readonly warnedClamp = new WeakSet<ParticlePhysics>();
    private neighborSearch: NeighborSearchPipeline;
    /** Grade com que a vizinhança foi criada. */
    private neighborKey: string;
    /** Geração da busca de vizinhança (discriminador próprio a cada recriação). */
    private neighborGeneration = 0;
    /** Iterações do quadro corrente (decididas em `framePrepare`). */
    private iterations = 0;

    constructor(ctx: FlowContext, options: SPHFlowOptions = {}) {
        super();
        const work = new SPHWork();
        this.work = { core: ctx.core, resources: ctx.resources, work };
        this.slots = {
            bodies: slot.bodies(),
            time: slot.singleton(Time.schema),
            gravity: slot.singleton(GravityField.schema, { optional: true }),
            physics: slot.singleton(ParticlePhysics.schema, { optional: true }),
            colliderPools: slot.pools([...COLLIDER_POOL_KEYS, LCPSchema.name]),
            colliders: slot.entities({ all: [Collider] }),
            normals: slot.pool(SPHNormalSchema.name),
            boundary: slot.pool(SPHBoundarySchema.name),
            work: slot.work(() => work),
        };
        this.minSubsteps = Math.max(1, options.substeps ?? 1);
        this.maxNeighbors = options.maxNeighbors ?? 128;
        this.params = new PerStepUniforms(this.work, {
            id: 'sph_params',
            schema: SPHSimParamsSchema,
        });
        this.params.reserve(1);
        this.colliderSet = new ColliderSet(this.work, ctx.world, {
            discriminator: 'sph_colliders',
        });
        const grid = gridOf(ParticlePhysics.defaults);
        this.neighborKey = gridKeyOf(grid);
        this.neighborSearch = this.createNeighborSearch(grid);
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
            compute('sph_boundary', sphBoundary, 'sph_boundary_main'),
            compute('sph_density', sphDensity, 'sph_density_main'),
            compute('sph_normals', sphNormals, 'sph_normals_main'),
            compute('sph_pressure', sphPressure, 'sph_pressure_main'),
            compute('sph_forces', sphForces, 'sph_forces_main'),
            compute('sph_integrate', sphIntegrate, 'sph_integrate_main'),
            compute('sph_collision', sphCollision, 'sph_collision_main'),
        ];
        const colliders = {
            to: 'running' as const,
            run: (_e: unknown, c: Ctx) => {
                this.refreshColliders(c);
            },
        };
        this.transitions = {
            '*': {
                // O trabalho já está na cena: a vizinhança (fonte privada) liga ao que a C2 alocou.
                slotsResolved: {
                    to: 'running',
                    run: (_e, c) => {
                        c.bind(this.neighborSources());
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
                poolReallocated: colliders,
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
            },
        };
    }

    /** Grava as iterações do quadro (decididas em `framePrepare`). */
    dispatch(frame: Frame, bound: BoundFlow<SPHSlots>): void {
        const count = bound.slots.bodies.count;
        if (this.iterations === 0 || count === 0) return;
        const boundary = bound.compute('sph_boundary');
        const density = bound.compute('sph_density');
        const normals = bound.compute('sph_normals');
        const pressure = bound.compute('sph_pressure');
        const forces = bound.compute('sph_forces');
        const integrate = bound.compute('sph_integrate');
        const collision = bound.compute('sph_collision');
        // A iteração inteira no passe da busca de vizinhos: cada passe aberto custa mais que um despacho destas
        // partículas, e dentro do passe cada despacho vê o que o anterior escreveu.
        const run = (
            pass: ComputePass,
            p: PreparedCompute,
            offset: number[],
            label: string,
        ): void => {
            pass.marker(label);
            pass.bind.setPipeline(p.spec);
            p.bindTo(pass.bind, { draw: offset });
            pass.dispatch.invocations(count, WORKGROUP_SIZE.value);
        };
        for (let i = 0; i < this.iterations; i++) {
            const offset = [this.params.offset(i)];
            // A vizinhança acompanha cada iteração (as posições mudam entre elas).
            this.neighborSearch.rebuild(frame, count, (pass) => {
                run(pass, boundary, offset, 'SPHFlow.boundary');
                run(pass, density, offset, 'SPHFlow.density');
                if (this.cohesionOn) run(pass, normals, offset, 'SPHFlow.normals');
                run(pass, pressure, offset, 'SPHFlow.pressure');
                run(pass, forces, offset, 'SPHFlow.forces');
                run(pass, integrate, offset, 'SPHFlow.integrate');
                run(pass, collision, offset, 'SPHFlow.collision');
            });
        }
    }

    /** Libera os kernels da busca de vizinhança (os buffers são do `SPHWork` e saem da cena com ele). */
    override dispose(): void {
        this.neighborSearch.dispose();
    }

    private createNeighborSearch(
        grid: ReturnType<ParticlePhysics['gridFor']>,
    ): NeighborSearchPipeline {
        const ns = new NeighborSearchPipeline(this.work, {
            // Uma geração por grade: a busca recriada (a física mudou) não pode repetir as specs da anterior — a C1
            // devolveria os bind groups antigos, ligados aos buffers destruídos.
            discriminator: `sph:gen${this.neighborGeneration++}`,
            maxParticles: NEIGHBOR_SEARCH_MAX_PARTICLES,
            maxNeighbors: this.maxNeighbors,
            particleStrideF32: SPHSchema.stride / 4,
            cellSize: grid.cellSize,
            gridDim: grid.gridDim,
            origin: grid.origin,
            byRank: true,
        });
        ns.allocate();
        return ns;
    }

    private neighborSources(): Map<WgslResource, BindingSource> {
        return new Map<WgslResource, BindingSource>([
            [sphResources.neighborList, this.neighborSearch.neighborList!],
            [sphResources.neighborCount, this.neighborSearch.neighborCount!],
            [sphResources.neighborOrder, this.neighborSearch.neighborOrder!],
        ]);
    }

    /** Mapas de dono e contagens dos colliders; religa as fontes do grupo de colliders quando mudam. */
    private refreshColliders(ctx: Ctx): void {
        this.colliderSet.markDirty();
        this.syncColliders(ctx);
    }

    /** Reconstrói os mapas de dono se sujos e religa as fontes que mudaram. */
    private syncColliders(ctx: Ctx): void {
        if (this.colliderSet.refresh()) ctx.bind(this.colliderSet.sources());
    }

    /**
     * Antes da gravação: vizinhança pela grade da física (recriada e religada quando muda) e preparada para as
     * iterações do quadro, substeps pelo passo estável e uma região de `SPHSimParams` por iteração.
     */
    private prepareFrame(ctx: Ctx): void {
        const bound = ctx.bound;
        NeighborSearchPipeline.requireCapacity('SPHFlow', bound.slots.bodies);
        const time = bound.slots.time.resource as Time;
        const physics =
            (bound.slots.physics?.resource as ParticlePhysics | undefined)
            ?? ParticlePhysics.defaults;
        const grid = gridOf(physics);
        const key = gridKeyOf(grid);
        if (key !== this.neighborKey) {
            this.neighborSearch.dispose();
            this.neighborSearch = this.createNeighborSearch(grid);
            this.neighborKey = key;
            ctx.bind(this.neighborSources());
        }
        const surface = physics.surfaceStep(time.stepDt, physics.sphStableDt, this.minSubsteps);
        if (surface.clamped) this.warnClamp(physics, surface);
        const substeps = surface.substeps;
        this.cohesionOn = surface.cohesion > 0;
        this.iterations = time.steps * substeps;
        if (this.iterations === 0) return;
        this.neighborSearch.prepare(
            bound.slots.bodies.buffer,
            bound.slots.bodies.live,
            this.iterations,
        );
        // Uma região por iteração (a C2 realoca e religa o fornecedor do trabalho quando cresce).
        this.params.reserve(this.iterations);
        const accel = (
            bound.slots.gravity?.resource as GravityField | undefined
        )?.uniformAcceleration() ?? [0, -9.81, 0, 0];
        const count = bound.slots.bodies.count;
        for (let i = 0; i < this.iterations; i++) {
            this.params.write(i, {
                gravity: [accel[0] ?? 0, accel[1] ?? -9.81, accel[2] ?? 0],
                dt: time.stepDt / substeps,
                rest_density: physics.restDensity,
                h: physics.sphSmoothingLength,
                stiffness: physics.taitStiffness,
                gamma: TAIT_GAMMA,
                viscosity: physics.viscosity,
                xsph_c: physics.xsph,
                dt_frame: time.stepDt,
                collision_radius: physics.particleSpacing / 2,
                particle_count: count,
                max_neighbors: this.maxNeighbors,
                neighbor_stride: NEIGHBOR_SEARCH_MAX_PARTICLES,
                restitution: physics.restitution,
                wet_neighbors:
                    physics.contactAngle < 90 && physics.slidingAngle > 0
                        ? ParticlePhysics.WET_NEIGHBORS
                        : 0,
                wet_pinning:
                    Math.hypot(accel[0] ?? 0, accel[1] ?? -9.81, accel[2] ?? 0)
                    * Math.sin((physics.slidingAngle * Math.PI) / 180),
                bound_min: physics.domainMin,
                bound_max: physics.domainMax,
                open_bounds: physics.openBounds ? 1 : 0,
                particle_mass: physics.particleMass,
                inv_particle_mass: 1 / physics.particleMass,
                cohesion_gamma: physics.cohesionGamma(surface.cohesion),
                adhesion_accel: physics.adhesionAccel(surface.adhesion),
                adhesion_tangential: physics.adhesionTangential(surface.adhesion),
                support: 2 * physics.sphSmoothingLength,
                // Fim da iteração i (passo ⌊i/substeps⌋): o mesmo tempo em qualquer taxa (spec 009).
                field_time:
                    time.stepTime(Math.floor(i / substeps))
                    + ((i % substeps) + 1) * (time.stepDt / substeps),
                field_density: physics.restDensity,
            });
        }
        this.params.flush(this.iterations);
    }

    /** Aviso único por `ParticlePhysics`: coesão/adesão acima do teto de substeps foram grampeadas. */
    private warnClamp(physics: ParticlePhysics, surface: SurfaceStep): void {
        if (this.warnedClamp.has(physics)) return;
        this.warnedClamp.add(physics);
        console.warn(
            `SPHFlow: coesão ${physics.cohesion} / adesão ${physics.adhesion} exigem mais que o teto de substeps; `
                + `usando ${surface.cohesion.toPrecision(3)} / ${surface.adhesion.toPrecision(3)}`,
        );
    }
}

/** Vizinhança com raio = suporte do núcleo (2h) e grade pelo domínio. */
function gridOf(physics: ParticlePhysics): ReturnType<ParticlePhysics['gridFor']> {
    return physics.gridFor(2 * physics.sphSmoothingLength);
}

function gridKeyOf(grid: ReturnType<ParticlePhysics['gridFor']>): string {
    return `${grid.cellSize}|${grid.gridDim.join(',')}|${grid.origin.join(',')}`;
}
