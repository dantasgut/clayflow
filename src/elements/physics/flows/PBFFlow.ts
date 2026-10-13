import type { EngineCore, Frame, StorageBufferSpec } from '../../../scene/contracts/gpu';
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
import {
    NEIGHBOR_SEARCH_MAX_PARTICLES,
    NeighborSearchPipeline,
} from '../../gpu/NeighborSearchPipeline';
import { LCPSchema } from '../bodies/schemas/LCPSchema';
import { Collider } from '../colliders/Collider';
import { COLLIDER_POOLS, ColliderSet } from '../colliders/ColliderSet';
import { GravityField } from '../forcefields/GravityField';
import { ParticleMaterial } from '../materials/ParticleMaterial';
import { PBFSimParamsSchema } from '../schemas/simParams';
import {
    pbfApply,
    pbfCollision,
    pbfDensityLambda,
    pbfPositionCorrect,
    pbfPredict,
    pbfVelocityUpdate,
    pbfVorticity,
    pbfXsph,
} from '../shaders/pbf';
import { PerStepUniforms } from '../../gpu/compute/PerStepUniforms';

/** Expoente n do `s_corr`. */
const PBF_S_CORR_N = 4;
/** ε do confinamento de vorticidade (0 = desligado). */
const PBF_VORTICITY_EPS = 0;
/** Coeficiente do XSPH. */
const PBF_XSPH = 0.05;
/** Relaxação ε do denominador de λ (Macklin & Müller 2013), nas unidades de |∇C|² (1/m²). */
const PBF_RELAXATION = 600;
/** Coeficiente do `s_corr` para espaçamento de 0,05 m; escala com s² (mesma unidade de λ). */
const PBF_S_CORR_K_AT_5CM = 1e-4;

/** Opções do `PBFFlow`. */
export interface PBFFlowOptions {
    /** Substeps por passo de física (padrão 1). O passo vem do `Time` da cena. */
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
    /** Material das partículas (opcional; padrões do solver). */
    readonly material: SingletonSlot<true>;
    /** Pools de colliders e de corpos rígidos (cada um presente ou não). */
    readonly colliderPools: PoolsSlot;
    /** Entidades com collider (donos dos registros nos pools de collider). */
    readonly colliders: EntitiesSlot;
}

const slots: PBFSlots = {
    bodies: slot.bodies(),
    time: slot.singleton(Time.schema),
    gravity: slot.singleton(GravityField.schema, { optional: true }),
    material: slot.singleton(ParticleMaterial.schema, { optional: true }),
    colliderPools: slot.pools([...COLLIDER_POOLS.map((s) => s.name), LCPSchema.name]),
    colliders: slot.entities({ all: [Collider] }),
};

type Ctx = TransitionContext<PBFSlots>;

/**
 * PBFFlow — fluidos por Position Based Fluids. O quadro executa `time.steps × substeps` iterações; cada uma
 * reconstrói a vizinhança e roda predict → (densidade/λ → correção → aplicação → colisão)×N → velocidade →
 * vorticidade → XSPH com a sua região de `PBFSimParams` (`dt = stepDt / substeps`, `dt_frame = stepDt`) ligada por
 * offset dinâmico.
 *
 * Recursos privados — parâmetros por iteração, correções `pbf_delta`, busca de vizinhança (recriada quando a grade do
 * material muda) e `ColliderSet` — são preparados e religados em transições, nunca no `dispatch`.
 */
export class PBFFlow extends Flow<PBFSlots, 'running'> {
    readonly type = 'PBFFlow';
    readonly slots = slots;
    override readonly pipelines: readonly PipelineDescriptor[];
    override readonly bindings: BindingSources;
    protected readonly initialState = 'running' as const;
    protected readonly transitions: FlowTransitions<'running', TransitionContext<PBFSlots>>;

    private readonly core: EngineCore;
    private readonly substeps: number;
    private readonly solverIters: number;
    private readonly maxNeighbors: number;
    private readonly params: PerStepUniforms;
    private readonly colliderSet: ColliderSet;
    /** Correções Δp/Δv por partícula (vec4f), separadas das posições/velocidades lidas pelos vizinhos. */
    private readonly delta: StorageBufferSpec;
    private neighborSearch: NeighborSearchPipeline;
    /** Grade com que a vizinhança foi criada. */
    private neighborKey: string;
    /** Iterações do quadro corrente (decididas em `framePrepare`). */
    private iterations = 0;

    constructor(ctx: FlowContext, options: PBFFlowOptions = {}) {
        super();
        this.core = ctx.core;
        const bodyType = ctx.bodyType ?? 'PBFSchema';
        this.substeps = Math.max(1, options.substeps ?? 1);
        this.solverIters = Math.max(1, options.solverIters ?? 4);
        this.maxNeighbors = options.maxNeighbors ?? 64;
        this.params = new PerStepUniforms(ctx.core, {
            discriminator: 'pbf_params',
            schema: PBFSimParamsSchema,
        });
        this.params.reserve(1);
        this.colliderSet = new ColliderSet(ctx.core, ctx.world, ctx.resources, {
            discriminator: 'pbf_colliders',
        });
        this.delta = ctx.core.create<StorageBufferSpec>({
            kind: 'buffer',
            subkind: 'storage',
            discriminator: 'pbf_delta',
            byteSize: NEIGHBOR_SEARCH_MAX_PARTICLES * 16,
        });
        const grid = gridOf(ParticleMaterial.defaults);
        this.neighborKey = gridKeyOf(grid);
        this.neighborSearch = this.createNeighborSearch(grid);
        this.bindings = {
            pbf_params: this.params.source(),
            pbf_delta: this.delta,
            ...this.neighborSources(),
        };
        const consumes = [bodyType, `${bodyType}.live`];
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
            compute('pbf_predict', pbfPredict, 'pbf_predict_main'),
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
    dispatch(frame: Frame, bound: BoundFlow<PBFSlots>): void {
        const count = bound.slots.bodies.count;
        if (this.iterations === 0 || count === 0) return;
        const p = (id: string): PreparedCompute => bound.compute(id);
        const predict = p('pbf_predict');
        const densityLambda = p('pbf_density_lambda');
        const positionCorrect = p('pbf_position_correct');
        const applyPosition = p('pbf_apply_position');
        const collision = p('pbf_collision');
        const velocityUpdate = p('pbf_velocity_update');
        const vorticity = p('pbf_vorticity');
        const xsph = p('pbf_xsph');
        const applyVelocity = p('pbf_apply_velocity');
        const run = (label: string, k: PreparedCompute, offset: number[]): void => {
            frame.compute(label, (pass) => {
                pass.bind.setPipeline(k.spec);
                k.groups.forEach((bg, g) =>
                    pass.bind.setBindGroup(g, bg, k.dynamic[g] ? offset : undefined),
                );
                pass.dispatch.invocations(count, 64);
            });
        };
        for (let i = 0; i < this.iterations; i++) {
            const offset = [this.params.offset(i)];
            // A vizinhança acompanha cada iteração (as posições mudam entre elas).
            this.neighborSearch.rebuild(frame, count);
            run('PBFFlow.predict', predict, offset);
            // Colisão dentro do laço do solver: cada projeção de densidade é seguida da projeção nos colliders.
            for (let it = 0; it < this.solverIters; it++) {
                run('PBFFlow.density_lambda', densityLambda, offset);
                run('PBFFlow.position_correct', positionCorrect, offset);
                run('PBFFlow.apply_position', applyPosition, offset);
                run('PBFFlow.collision', collision, offset);
            }
            run('PBFFlow.velocity_update', velocityUpdate, offset);
            run('PBFFlow.vorticity', vorticity, offset);
            run('PBFFlow.xsph', xsph, offset);
            run('PBFFlow.apply_velocity', applyVelocity, offset);
        }
    }

    /** Libera parâmetros, correções, colliders e a busca de vizinhança. */
    override dispose(): void {
        this.params.dispose();
        this.core.destroy(this.delta);
        this.colliderSet.destroy();
        this.neighborSearch.dispose();
    }

    private createNeighborSearch(
        grid: ReturnType<ParticleMaterial['gridFor']>,
    ): NeighborSearchPipeline {
        const ns = new NeighborSearchPipeline(this.core, {
            discriminator: 'pbf',
            maxParticles: NEIGHBOR_SEARCH_MAX_PARTICLES,
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
     * iterações do quadro, e uma região de `PBFSimParams` por iteração.
     */
    private prepareFrame(ctx: Ctx): void {
        const bound = ctx.bound;
        NeighborSearchPipeline.requireCapacity('PBFFlow', bound.slots.bodies);
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
        this.iterations = time.steps * this.substeps;
        if (this.iterations === 0) return;
        this.neighborSearch.prepare(
            bound.slots.bodies.buffer,
            bound.slots.bodies.live,
            this.iterations,
        );
        if (this.params.reserve(this.iterations)) ctx.bind({ pbf_params: this.params.source() });
        const accel = (bound.slots.gravity?.resource as GravityField | undefined)?.data
            .acceleration ?? [0, -9.81, 0, 0];
        const count = bound.slots.bodies.count;
        const spacingRatio = material.particleSpacing / 0.05;
        for (let i = 0; i < this.iterations; i++) {
            this.params.write(i, {
                gravity: [accel[0] ?? 0, accel[1] ?? -9.81, accel[2] ?? 0],
                dt: time.stepDt / this.substeps,
                rest_density: material.restDensity,
                h: material.pbfSmoothingLength,
                relaxation: PBF_RELAXATION,
                s_corr_k: PBF_S_CORR_K_AT_5CM * spacingRatio * spacingRatio,
                s_corr_n: PBF_S_CORR_N,
                vorticity_eps: PBF_VORTICITY_EPS,
                xsph_c: PBF_XSPH,
                dt_frame: time.stepDt,
                particle_count: count,
                max_neighbors: this.maxNeighbors,
                restitution: material.restitution,
                collision_radius: material.particleSpacing / 2,
                bound_min: material.domainMin,
                particle_mass: material.particleMass,
                mass_over_density: material.particleMass / material.restDensity,
            });
        }
        this.params.flush(this.iterations);
    }
}

/** Vizinhança com raio = suporte do núcleo (h) e grade pelo domínio. */
function gridOf(material: ParticleMaterial): ReturnType<ParticleMaterial['gridFor']> {
    return material.gridFor(material.pbfSmoothingLength);
}

function gridKeyOf(grid: ReturnType<ParticleMaterial['gridFor']>): string {
    return `${grid.cellSize}|${grid.gridDim.join(',')}|${grid.origin.join(',')}`;
}
