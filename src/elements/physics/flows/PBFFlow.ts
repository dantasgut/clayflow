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
import { ParticlePhysics, type SurfaceStep } from '../ParticlePhysics';
import { PBFSimParamsSchema } from '../schemas/simParams';
import {
    pbfApply,
    pbfBoundary,
    pbfCollision,
    pbfDensityLambda,
    pbfPositionCorrect,
    pbfPredict,
    pbfVelocityUpdate,
    pbfVorticity,
    pbfXsph,
    pbfResources,
} from '../shaders/pbf';
import { FLUID_BOUNDARY_POLY6 } from '../../gpu/shaders/math';
import { PBFSchema } from '../bodies/schemas/PBFSchema';
import { PBFBoundarySchema, PBFDeltaSchema, PBFNormalSchema } from '../bodies/schemas/fluidWork';
import { PerStepUniforms } from '../../gpu/compute/PerStepUniforms';

/** Expoente n do `s_corr`. */
const PBF_S_CORR_N = 4;
/** ε do confinamento de vorticidade (0 = desligado). */
const PBF_VORTICITY_EPS = 0;
/** Relaxação ε do denominador de λ (Macklin & Müller 2013), nas unidades de |∇C|² (1/m²). */
const PBF_RELAXATION = 600;
/** Coeficiente do `s_corr` para espaçamento de 0,05 m; escala com s² (mesma unidade de λ). */
const PBF_S_CORR_K_AT_5CM = 1e-4;

/** Opções do `PBFFlow`. */
export interface PBFFlowOptions {
    /**
     * Mínimo de substeps por passo de física (padrão 1); o passo estável do `ParticlePhysics` pode exigir mais (spec
     * 017). O passo vem do `Time` da cena.
     */
    readonly substeps?: number;
    /** Iterações de projeção de densidade por substep (padrão 4). */
    readonly solverIters?: number;
    /** Vizinhos guardados por partícula (padrão 64). */
    readonly maxNeighbors?: number;
}

/** Slots do PBF. */
export interface PBFSlots extends SlotMap {
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
    /** Correções Δp/Δv por partícula (pool do corpo, mesmo slot), separadas das posições lidas pelos vizinhos. */
    readonly delta: PoolSlot<false>;
    /** (nᵢ, ρᵢ) por partícula para a tensão superficial de Akinci (pool do corpo, mesmo slot; spec 030). */
    readonly normals: PoolSlot<false>;
    /** Fronteira sólida por partícula (pool do corpo, mesmo slot; Σ −B' n, Σ B; spec 034). */
    readonly boundary: PoolSlot<false>;
    /** O espaço de trabalho do solver: parâmetros por iteração, vizinhança, colliders (spec 039). */
    readonly work: WorkSlot<PBFWork>;
}

/** Resource de trabalho do `PBFFlow` (spec 039). */
class PBFWork extends FlowWork {
    static readonly schema = new StructSchema('PBFWork', {});
}

type Ctx = TransitionContext<PBFSlots>;

/**
 * PBFFlow — fluidos por Position Based Fluids. O quadro executa `time.steps × substeps` iterações; cada uma
 * reconstrói a vizinhança e roda predict → (densidade/λ → correção → aplicação → colisão)×N → velocidade →
 * vorticidade → XSPH com a sua região de `PBFSimParams` (`dt = stepDt / substeps`, `dt_frame = stepDt`) ligada por
 * offset dinâmico.
 *
 * O espaço de trabalho — parâmetros por iteração, busca de vizinhança (recriada quando a grade da física muda) e
 * `ColliderSet` — é do Resource de trabalho (`PBFWork`); as correções, as normais e a fronteira por partícula são pools
 * do próprio corpo (spec 039). Tudo é preparado e religado em transições, nunca no `dispatch`.
 */
export class PBFFlow extends Flow<PBFSlots, 'running'> {
    readonly type = 'PBFFlow';
    readonly slots: PBFSlots;
    override readonly pipelines: readonly PipelineDescriptor[];
    protected readonly initialState = 'running' as const;
    protected readonly transitions: FlowTransitions<'running', TransitionContext<PBFSlots>>;

    private readonly work: WorkContext;
    private readonly minSubsteps: number;
    /** Substeps do quadro corrente (pelo passo estável da física). */
    private substeps = 1;
    private readonly solverIters: number;
    private readonly maxNeighbors: number;
    private readonly params: PerStepUniforms;
    private readonly colliderSet: ColliderSet;
    /** Materiais já avisados de coesão/adesão grampeadas. */
    private readonly warnedClamp = new WeakSet<ParticlePhysics>();
    private neighborSearch: NeighborSearchPipeline;
    /** Grade com que a vizinhança foi criada. */
    private neighborKey: string;
    /** Geração da busca de vizinhança (discriminador próprio a cada recriação). */
    private neighborGeneration = 0;
    /** Iterações do quadro corrente (decididas em `framePrepare`). */
    private iterations = 0;

    constructor(ctx: FlowContext, options: PBFFlowOptions = {}) {
        super();
        const work = new PBFWork();
        this.work = { core: ctx.core, resources: ctx.resources, work };
        this.slots = {
            bodies: slot.bodies(),
            time: slot.singleton(Time.schema),
            gravity: slot.singleton(GravityField.schema, { optional: true }),
            physics: slot.singleton(ParticlePhysics.schema, { optional: true }),
            colliderPools: slot.pools([...COLLIDER_POOL_KEYS, LCPSchema.name]),
            colliders: slot.entities({ all: [Collider] }),
            delta: slot.pool(PBFDeltaSchema.name),
            normals: slot.pool(PBFNormalSchema.name),
            boundary: slot.pool(PBFBoundarySchema.name),
            work: slot.work(() => work),
        };
        this.minSubsteps = Math.max(1, options.substeps ?? 1);
        this.solverIters = Math.max(1, options.solverIters ?? 4);
        this.maxNeighbors = options.maxNeighbors ?? 64;
        this.params = new PerStepUniforms(this.work, {
            id: 'pbf_params',
            schema: PBFSimParamsSchema,
        });
        this.params.reserve(1);
        this.colliderSet = new ColliderSet(this.work, ctx.world, {
            discriminator: 'pbf_colliders',
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
            compute('pbf_predict', pbfPredict, 'pbf_predict_main'),
            {
                ...compute('pbf_boundary', pbfBoundary, 'pbf_boundary_main'),
                constants: FLUID_BOUNDARY_POLY6,
            },
            compute('pbf_density_lambda', pbfDensityLambda, 'pbf_density_lambda_main'),
            compute('pbf_position_correct', pbfPositionCorrect, 'pbf_position_correct_main'),
            compute('pbf_apply_position', pbfApply, 'pbf_apply_position_main'),
            compute('pbf_collision', pbfCollision, 'pbf_collision_main'),
            compute('pbf_velocity_update', pbfVelocityUpdate, 'pbf_velocity_update_main'),
            compute('pbf_vorticity', pbfVorticity, 'pbf_vorticity_main'),
            compute('pbf_xsph', pbfXsph, 'pbf_xsph_main'),
            compute('pbf_apply_velocity', pbfApply, 'pbf_apply_velocity_main'),
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
    dispatch(frame: Frame, bound: BoundFlow<PBFSlots>): void {
        const count = bound.slots.bodies.count;
        if (this.iterations === 0 || count === 0) return;
        const p = (id: string): PreparedCompute => bound.compute(id);
        const predict = p('pbf_predict');
        const boundary = p('pbf_boundary');
        const densityLambda = p('pbf_density_lambda');
        const positionCorrect = p('pbf_position_correct');
        const applyPosition = p('pbf_apply_position');
        const collision = p('pbf_collision');
        const velocityUpdate = p('pbf_velocity_update');
        const vorticity = p('pbf_vorticity');
        const xsph = p('pbf_xsph');
        const applyVelocity = p('pbf_apply_velocity');
        // Cada passe aberto custa mais que um despacho destas partículas: a iteração inteira vai no passe da busca de
        // vizinhos (dentro do passe, cada despacho vê o que o anterior escreveu).
        const run = (
            pass: ComputePass,
            k: PreparedCompute,
            offset: number[],
            label: string,
        ): void => {
            pass.marker(label);
            pass.bind.setPipeline(k.spec);
            k.bindTo(pass.bind, { draw: offset });
            pass.dispatch.invocations(count, WORKGROUP_SIZE.value);
        };
        for (let i = 0; i < this.iterations; i++) {
            const offset = [this.params.offset(i)];
            // A vizinhança acompanha cada iteração (as posições mudam entre elas).
            this.neighborSearch.rebuild(frame, count, (pass) => {
                run(pass, predict, offset, 'PBFFlow.predict');
                // Colisão dentro do laço do solver: cada projeção de densidade é seguida da projeção nos colliders.
                for (let it = 0; it < this.solverIters; it++) {
                    run(pass, boundary, offset, 'PBFFlow.boundary');
                    run(pass, densityLambda, offset, 'PBFFlow.density_lambda');
                    run(pass, positionCorrect, offset, 'PBFFlow.position_correct');
                    run(pass, applyPosition, offset, 'PBFFlow.apply_position');
                    run(pass, collision, offset, 'PBFFlow.collision');
                }
                run(pass, velocityUpdate, offset, 'PBFFlow.velocity_update');
                run(pass, vorticity, offset, 'PBFFlow.vorticity');
                run(pass, xsph, offset, 'PBFFlow.xsph');
                run(pass, applyVelocity, offset, 'PBFFlow.apply_velocity');
            });
        }
    }

    /** Libera os kernels da busca de vizinhança (os buffers são do `PBFWork` e saem da cena com ele). */
    override dispose(): void {
        this.neighborSearch.dispose();
    }

    private createNeighborSearch(
        grid: ReturnType<ParticlePhysics['gridFor']>,
    ): NeighborSearchPipeline {
        const ns = new NeighborSearchPipeline(this.work, {
            // Uma geração por grade: a busca recriada (a física mudou) não pode repetir as specs da anterior — a C1
            // devolveria os bind groups antigos, ligados aos buffers destruídos.
            discriminator: `pbf:gen${this.neighborGeneration++}`,
            maxParticles: NEIGHBOR_SEARCH_MAX_PARTICLES,
            maxNeighbors: this.maxNeighbors,
            particleStrideF32: PBFSchema.stride / 4,
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
            [pbfResources.neighborList, this.neighborSearch.neighborList!],
            [pbfResources.neighborCount, this.neighborSearch.neighborCount!],
            [pbfResources.neighborOrder, this.neighborSearch.neighborOrder!],
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
     * iterações do quadro, e uma região de `PBFSimParams` por iteração.
     */
    private prepareFrame(ctx: Ctx): void {
        const bound = ctx.bound;
        NeighborSearchPipeline.requireCapacity('PBFFlow', bound.slots.bodies);
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
        // Substeps pelo passo estável da física (spec 017: abaixo de 5 cm o passo fixo explodia o fluido).
        // Coesão/adesão podem pedir mais substeps (spec 030); com as duas em zero, é o passo estável do PBF.
        const surface = physics.surfaceStep(time.stepDt, physics.pbfStableDt, this.minSubsteps);
        if (surface.clamped) this.warnClamp(physics, surface);
        this.substeps = surface.substeps;
        this.iterations = time.steps * this.substeps;
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
        const spacingRatio = physics.particleSpacing / 0.05;
        for (let i = 0; i < this.iterations; i++) {
            this.params.write(i, {
                gravity: [accel[0] ?? 0, accel[1] ?? -9.81, accel[2] ?? 0],
                dt: time.stepDt / this.substeps,
                rest_density: physics.restDensity,
                h: physics.pbfSmoothingLength,
                relaxation: PBF_RELAXATION,
                s_corr_k: PBF_S_CORR_K_AT_5CM * spacingRatio * spacingRatio,
                s_corr_n: PBF_S_CORR_N,
                vorticity_eps: PBF_VORTICITY_EPS,
                xsph_c: physics.xsph,
                dt_frame: time.stepDt,
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
                collision_radius: physics.particleSpacing / 2,
                bound_min: physics.domainMin,
                bound_max: physics.domainMax,
                open_bounds: physics.openBounds ? 1 : 0,
                particle_mass: physics.particleMass,
                mass_over_density: physics.particleMass / physics.restDensity,
                cohesion_gamma: physics.cohesionGamma(surface.cohesion),
                adhesion_accel: physics.adhesionAccel(surface.adhesion),
                adhesion_tangential: physics.adhesionTangential(surface.adhesion),
                support: physics.pbfSmoothingLength,
                // Fim da iteração i (passo ⌊i/substeps⌋): o mesmo tempo em qualquer taxa (spec 009).
                field_time:
                    time.stepTime(Math.floor(i / this.substeps))
                    + ((i % this.substeps) + 1) * (time.stepDt / this.substeps),
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
            `PBFFlow: coesão ${physics.cohesion} / adesão ${physics.adhesion} exigem mais que o teto de substeps; `
                + `usando ${surface.cohesion.toPrecision(3)} / ${surface.adhesion.toPrecision(3)}`,
        );
    }
}

/** Vizinhança com raio = suporte do núcleo (h) e grade pelo domínio. */
function gridOf(physics: ParticlePhysics): ReturnType<ParticlePhysics['gridFor']> {
    return physics.gridFor(physics.pbfSmoothingLength);
}

function gridKeyOf(grid: ReturnType<ParticlePhysics['gridFor']>): string {
    return `${grid.cellSize}|${grid.gridDim.join(',')}|${grid.origin.join(',')}`;
}
