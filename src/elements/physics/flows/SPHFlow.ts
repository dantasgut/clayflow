import type { EngineCore, Frame } from '../../../scene/contracts/gpu';
import type { PipelineDescriptor } from '../../../scene/descriptors/PipelineDescriptor';
import { Flow } from '../../../scene/flows/Flow';
import type {
    BindingSources,
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
    type PoolsSlot,
    type SingletonSlot,
    type SlotMap,
} from '../../../scene/flows/slots';
import { Time } from '../../../scene/time/Time';
import { NeighborSearchPipeline } from '../../gpu/NeighborSearchPipeline';
import { LCPSchema } from '../bodies/schemas/LCPSchema';
import { Collider } from '../colliders/Collider';
import { COLLIDER_POOLS, ColliderSet } from '../colliders/ColliderSet';
import { GravityField } from '../forcefields/GravityField';
import { ParticleMaterial, TAIT_GAMMA } from '../materials/ParticleMaterial';
import { SPHSimParamsSchema } from '../schemas/simParams';
import { sphCollision, sphDensity, sphForces, sphIntegrate, sphPressure } from '../shaders/sph';
import { PerStepUniforms } from '../../gpu/compute/PerStepUniforms';

/** Coeficiente do XSPH (suavização de velocidade). */
const SPH_XSPH = 0.05;

/** Opções do `SPHFlow`. */
export interface SPHFlowOptions {
    /** Mínimo de substeps por passo (padrão 1); o passo estável do `ParticleMaterial` pode exigir mais. */
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
    /** Material das partículas (opcional; padrões do solver). */
    readonly material: SingletonSlot<true>;
    /** Pools de colliders e de corpos rígidos (cada um presente ou não). */
    readonly colliderPools: PoolsSlot;
    /** Entidades com collider (donos dos registros nos pools de collider). */
    readonly colliders: EntitiesSlot;
}

const slots: SPHSlots = {
    bodies: slot.bodies(),
    time: slot.singleton(Time.schema),
    gravity: slot.singleton(GravityField.schema, { optional: true }),
    material: slot.singleton(ParticleMaterial.schema, { optional: true }),
    colliderPools: slot.pools([...COLLIDER_POOLS.map((s) => s.name), LCPSchema.name]),
    colliders: slot.entities({ all: [Collider] }),
};

type Ctx = TransitionContext<SPHSlots>;

/**
 * SPHFlow — fluidos por Smoothed Particle Hydrodynamics fracamente compressível (Tait). O quadro executa
 * `time.steps × substeps` iterações, com `substeps` pelo passo estável do `ParticleMaterial` (CFL 0,4 h/c); cada
 * uma reconstrói a vizinhança (raio = suporte 2h) e roda densidade → pressão → forças → integração → colisão com a
 * sua região de `SPHSimParams` (`dt = stepDt / substeps`, `dt_frame = stepDt`) ligada por offset dinâmico. Massa,
 * suavização, rigidez, viscosidade, restituição e domínio vêm do material.
 *
 * Recursos privados — parâmetros por iteração, busca de vizinhança (recriada quando a grade do material muda) e
 * `ColliderSet` — são preparados e religados em transições (`framePrepare`, entidades e pools de collider), nunca no
 * `dispatch`.
 */
export class SPHFlow extends Flow<SPHSlots, 'running'> {
    readonly type = 'SPHFlow';
    readonly slots = slots;
    override readonly pipelines: readonly PipelineDescriptor[];
    override readonly bindings: BindingSources;
    protected readonly initialState = 'running' as const;
    protected readonly transitions: FlowTransitions<'running', TransitionContext<SPHSlots>>;

    private readonly core: EngineCore;
    private readonly minSubsteps: number;
    private readonly maxNeighbors: number;
    private readonly params: PerStepUniforms;
    private readonly colliderSet: ColliderSet;
    private neighborSearch: NeighborSearchPipeline;
    /** Grade com que a vizinhança foi criada. */
    private neighborKey: string;
    /** Iterações do quadro corrente (decididas em `framePrepare`). */
    private iterations = 0;

    constructor(ctx: FlowContext, options: SPHFlowOptions = {}) {
        super();
        this.core = ctx.core;
        const bodyType = ctx.bodyType ?? 'SPHSchema';
        this.minSubsteps = Math.max(1, options.substeps ?? 1);
        this.maxNeighbors = options.maxNeighbors ?? 128;
        this.params = new PerStepUniforms(ctx.core, {
            discriminator: 'sph_params',
            schema: SPHSimParamsSchema,
        });
        this.params.reserve(1);
        this.colliderSet = new ColliderSet(ctx.core, ctx.world, ctx.resources, {
            discriminator: 'sph_colliders',
        });
        const grid = gridOf(ParticleMaterial.defaults);
        this.neighborKey = gridKeyOf(grid);
        this.neighborSearch = this.createNeighborSearch(grid);
        this.bindings = { sph_params: this.params.source(), ...this.neighborSources() };
        const consumes = [bodyType];
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
            compute('sph_density', sphDensity, 'sph_density_main'),
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
                slotsResolved: colliders,
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
        const density = bound.compute('sph_density');
        const pressure = bound.compute('sph_pressure');
        const forces = bound.compute('sph_forces');
        const integrate = bound.compute('sph_integrate');
        const collision = bound.compute('sph_collision');
        const run = (label: string, p: PreparedCompute, offset: number[]): void => {
            frame.compute(label, (pass) => {
                pass.bind.setPipeline(p.spec);
                p.groups.forEach((bg, g) =>
                    pass.bind.setBindGroup(g, bg, p.dynamic[g] ? offset : undefined),
                );
                pass.dispatch.invocations(count, 64);
            });
        };
        for (let i = 0; i < this.iterations; i++) {
            const offset = [this.params.offset(i)];
            // A vizinhança acompanha cada iteração (as posições mudam entre elas).
            this.neighborSearch.rebuild(frame, count);
            run('SPHFlow.density', density, offset);
            run('SPHFlow.pressure', pressure, offset);
            run('SPHFlow.forces', forces, offset);
            run('SPHFlow.integrate', integrate, offset);
            run('SPHFlow.collision', collision, offset);
        }
    }

    /** Libera parâmetros, colliders e a busca de vizinhança. */
    override dispose(): void {
        this.params.dispose();
        this.colliderSet.destroy();
        this.neighborSearch.dispose();
    }

    private createNeighborSearch(
        grid: ReturnType<ParticleMaterial['gridFor']>,
    ): NeighborSearchPipeline {
        const ns = new NeighborSearchPipeline(this.core, {
            discriminator: 'sph',
            maxParticles: 65536,
            maxNeighbors: this.maxNeighbors,
            particleStrideF32: 16,
            cellSize: grid.cellSize,
            gridDim: grid.gridDim,
            origin: grid.origin,
        });
        ns.allocate();
        return ns;
    }

    private neighborSources(): BindingSources {
        return {
            neighbor_list: this.neighborSearch.neighborList!,
            neighbor_count: this.neighborSearch.neighborCount!,
        };
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
     * Antes da gravação: vizinhança pela grade do material (recriada e religada quando muda) e preparada para as
     * iterações do quadro, substeps pelo passo estável e uma região de `SPHSimParams` por iteração.
     */
    private prepareFrame(ctx: Ctx): void {
        const bound = ctx.bound;
        const time = bound.slots.time.resource as Time;
        const material =
            (bound.slots.material?.resource as ParticleMaterial | undefined)
            ?? ParticleMaterial.defaults;
        const grid = gridOf(material);
        const key = gridKeyOf(grid);
        if (key !== this.neighborKey) {
            this.neighborSearch.dispose();
            this.neighborSearch = this.createNeighborSearch(grid);
            this.neighborKey = key;
            ctx.bind(this.neighborSources());
        }
        const substeps = ParticleMaterial.substepsFor(
            time.stepDt,
            material.sphStableDt,
            this.minSubsteps,
        );
        this.iterations = time.steps * substeps;
        if (this.iterations === 0) return;
        this.neighborSearch.prepare(bound.slots.bodies.buffer, this.iterations);
        if (this.params.reserve(this.iterations)) ctx.bind({ sph_params: this.params.source() });
        const accel = (bound.slots.gravity?.resource as GravityField | undefined)?.data
            .acceleration ?? [0, -9.81, 0, 0];
        const count = bound.slots.bodies.count;
        for (let i = 0; i < this.iterations; i++) {
            this.params.write(i, {
                gravity: [accel[0] ?? 0, accel[1] ?? -9.81, accel[2] ?? 0],
                dt: time.stepDt / substeps,
                rest_density: material.restDensity,
                h: material.sphSmoothingLength,
                stiffness: material.taitStiffness,
                gamma: TAIT_GAMMA,
                viscosity: material.viscosity,
                xsph_c: SPH_XSPH,
                dt_frame: time.stepDt,
                collision_radius: material.particleSpacing / 2,
                particle_count: count,
                max_neighbors: this.maxNeighbors,
                restitution: material.restitution,
                bound_min: material.domainMin,
                particle_mass: material.particleMass,
                inv_particle_mass: 1 / material.particleMass,
            });
        }
        this.params.flush(this.iterations);
    }
}

/** Vizinhança com raio = suporte do núcleo (2h) e grade pelo domínio. */
function gridOf(material: ParticleMaterial): ReturnType<ParticleMaterial['gridFor']> {
    return material.gridFor(2 * material.sphSmoothingLength);
}

function gridKeyOf(grid: ReturnType<ParticleMaterial['gridFor']>): string {
    return `${grid.cellSize}|${grid.gridDim.join(',')}|${grid.origin.join(',')}`;
}
