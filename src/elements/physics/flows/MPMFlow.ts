import type { EngineCore, Frame, StorageBufferSpec } from '../../../scene/contracts/gpu';
import type { PipelineDescriptor } from '../../../scene/descriptors/PipelineDescriptor';
import { Flow } from '../../../scene/flows/Flow';
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
    type PoolsSlot,
    type SingletonSlot,
    type SlotMap,
} from '../../../scene/flows/slots';
import type { WgslResource } from '../../../scene/shaders/WgslResource';
import { WORKGROUP_SIZE } from '../../../scene/shaders/engineConstants';
import { Time } from '../../../scene/time/Time';
import { LCPSchema } from '../bodies/schemas/LCPSchema';
import { Collider } from '../colliders/Collider';
import { COLLIDER_POOL_KEYS, ColliderSet } from '../colliders/ColliderSet';
import { GravityField } from '../forcefields/GravityField';
import { ParticlePhysics } from '../ParticlePhysics';
import { MPMSimParamsSchema } from '../schemas/simParams';
import { MPMGridNodeSchema } from '../schemas/simState';
import {
    mpmClearGrid,
    mpmG2P,
    mpmGridUpdate,
    mpmP2G,
    mpmParticleCollision,
    mpmResources as R,
} from '../shaders/mpm';
import { PerStepUniforms } from '../../gpu/compute/PerStepUniforms';

/** Escala do ponto fixo das somas atômicas da grade. */
const MPM_FIXED_SCALE = 1e7;
/** `material_id` do WGSL. */
const MPM_MATERIAL_ELASTIC = 0;
const MPM_MATERIAL_FLUID = 2;

/** Opções do `MPMFlow`. */
export interface MPMFlowOptions {
    /** Mínimo de substeps por passo (padrão 1); o passo estável do `ParticlePhysics` pode exigir mais. */
    readonly substeps?: number;
}

/** Slots do MPM. */
export interface MPMSlots extends SlotMap {
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
}

const slots: MPMSlots = {
    bodies: slot.bodies(),
    time: slot.singleton(Time.schema),
    gravity: slot.singleton(GravityField.schema, { optional: true }),
    physics: slot.singleton(ParticlePhysics.schema, { optional: true }),
    colliderPools: slot.pools([...COLLIDER_POOL_KEYS, LCPSchema.name]),
    colliders: slot.entities({ all: [Collider] }),
};

type Ctx = TransitionContext<MPMSlots>;

/**
 * MPMFlow — corpos por Material Point Method (MLS-MPM: limpa grade → P2G → atualização da grade → G2P → colisão):
 * fluido fracamente compressível (`MPMFluidSchema`) ou sólido neo-Hookean (`MPMSoftSchema`), conforme o `bodyType` do
 * registro. O quadro executa `time.steps × substeps` iterações, com `substeps` pelo passo estável do
 * `ParticlePhysics`, cada uma com a sua região de `MPMSimParams` (`dt = stepDt / substeps`, `dt_frame = stepDt`)
 * ligada por offset dinâmico. Massa, volume, grade (célula 2s sobre o domínio), módulo volumétrico e Lamé vêm do
 * `ParticlePhysics`.
 *
 * Slots: pool de partículas, `Time`, `GravityField` e `ParticlePhysics` (opcionais), pools de collider e as
 * entidades com collider. Recursos privados — grade, parâmetros por iteração e o `ColliderSet` — são recriados e
 * religados em transições (`framePrepare` para grade e parâmetros; entidades/pools para os colliders), nunca no
 * `dispatch`.
 */
export class MPMFlow extends Flow<MPMSlots, 'running'> {
    readonly type = 'MPMFlow';
    readonly slots = slots;
    override readonly pipelines: readonly PipelineDescriptor[];
    override readonly bindings: ReadonlyMap<WgslResource, BindingSource>;
    protected readonly initialState = 'running' as const;
    protected readonly transitions: FlowTransitions<'running', TransitionContext<MPMSlots>>;

    private readonly core: EngineCore;
    private readonly bodyType: string;
    private readonly minSubsteps: number;
    private readonly params: PerStepUniforms;
    private readonly colliderSet: ColliderSet;
    private grid: ReturnType<ParticlePhysics['gridFor']>;
    private gridKey = '';
    private gridBuffer: StorageBufferSpec;
    /** Iterações do quadro corrente (decididas em `framePrepare`). */
    private iterations = 0;

    constructor(ctx: FlowContext, options: MPMFlowOptions = {}) {
        super();
        this.core = ctx.core;
        this.bodyType = ctx.bodyType ?? 'MPMFluidSchema';
        this.minSubsteps = Math.max(1, options.substeps ?? 1);
        this.params = new PerStepUniforms(ctx.core, {
            discriminator: 'mpm_params',
            schema: MPMSimParamsSchema,
        });
        this.params.reserve(1);
        this.colliderSet = new ColliderSet(ctx.core, ctx.world, ctx.resources, {
            discriminator: 'mpm_colliders',
        });
        const physics = ParticlePhysics.defaults;
        this.grid = physics.gridFor(physics.mpmCellSize);
        this.gridKey = gridKeyOf(this.grid);
        this.gridBuffer = this.createGrid();
        this.bindings = new Map<WgslResource, BindingSource>([
            [R.params, this.params.source()],
            [R.grid, this.gridBuffer],
        ]);
        this.pipelines = [
            {
                id: 'mpm_clear_grid',
                role: 'compute',
                shader: mpmClearGrid,
                entryPoints: ['mpm_clear_grid_main'],
            },
            {
                id: 'mpm_p2g',
                role: 'compute',
                shader: mpmP2G,
                entryPoints: ['mpm_p2g_main'],
            },
            {
                id: 'mpm_grid_update',
                role: 'compute',
                shader: mpmGridUpdate,
                entryPoints: ['mpm_grid_update_main'],
            },
            {
                id: 'mpm_g2p',
                role: 'compute',
                shader: mpmG2P,
                entryPoints: ['mpm_g2p_main'],
            },
            {
                id: 'mpm_particle_collision',
                role: 'compute',
                shader: mpmParticleCollision,
                entryPoints: ['mpm_particle_collision_main'],
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
    dispatch(frame: Frame, bound: BoundFlow<MPMSlots>): void {
        const count = bound.slots.bodies.count;
        if (this.iterations === 0 || count === 0) return;
        const cells = this.gridCellCount();
        const clear = bound.compute('mpm_clear_grid');
        const p2g = bound.compute('mpm_p2g');
        const gridUpdate = bound.compute('mpm_grid_update');
        const g2p = bound.compute('mpm_g2p');
        const collision = bound.compute('mpm_particle_collision');
        const run = (
            label: string,
            p: PreparedCompute,
            invocations: number,
            offset: number[],
        ): void => {
            frame.compute(label, (pass) => {
                pass.bind.setPipeline(p.spec);
                // Grupo dos parâmetros (`draw`) com o offset dinâmico da iteração; demais grupos sem offset.
                p.bindTo(pass.bind, { draw: offset });
                pass.dispatch.invocations(invocations, WORKGROUP_SIZE.value);
            });
        };
        for (let i = 0; i < this.iterations; i++) {
            const offset = [this.params.offset(i)];
            run('MPMFlow.clear_grid', clear, cells, offset);
            run('MPMFlow.p2g', p2g, count, offset);
            run('MPMFlow.grid_update', gridUpdate, cells, offset);
            run('MPMFlow.g2p', g2p, count, offset);
            run('MPMFlow.collision', collision, count, offset);
        }
    }

    /** Libera parâmetros, grade e colliders. */
    override dispose(): void {
        this.params.dispose();
        this.core.destroy(this.gridBuffer);
        this.colliderSet.destroy();
    }

    private gridCellCount(): number {
        return this.grid.gridDim[0] * this.grid.gridDim[1] * this.grid.gridDim[2];
    }

    private createGrid(): StorageBufferSpec {
        return this.core.create<StorageBufferSpec>({
            kind: 'buffer',
            subkind: 'storage',
            discriminator: 'mpm_grid',
            byteSize: this.gridCellCount() * MPMGridNodeSchema.stride,
        });
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
     * Antes da gravação: grade pela física (recriada e religada quando muda), substeps pelo passo estável e uma
     * região de `MPMSimParams` por iteração (crescimento e religação aqui, fora da gravação).
     */
    private prepareFrame(ctx: Ctx): void {
        const bound = ctx.bound;
        const time = bound.slots.time.resource as Time;
        const physics =
            (bound.slots.physics?.resource as ParticlePhysics | undefined)
            ?? ParticlePhysics.defaults;
        const grid = physics.gridFor(physics.mpmCellSize);
        const key = gridKeyOf(grid);
        if (key !== this.gridKey) {
            this.grid = grid;
            this.gridKey = key;
            this.core.destroy(this.gridBuffer);
            this.gridBuffer = this.createGrid();
            ctx.bind(new Map([[R.grid, this.gridBuffer]]));
        }
        const substeps = ParticlePhysics.substepsFor(
            time.stepDt,
            physics.mpmStableDt,
            this.minSubsteps,
        );
        this.iterations = time.steps * substeps;
        if (this.iterations === 0) return;
        if (this.params.reserve(this.iterations))
            ctx.bind(new Map([[R.params, this.params.source()]]));
        const accel = (
            bound.slots.gravity?.resource as GravityField | undefined
        )?.uniformAcceleration() ?? [0, -9.81, 0, 0];
        const { mu, lambda } = physics.lame;
        const count = bound.slots.bodies.count;
        for (let i = 0; i < this.iterations; i++) {
            this.params.write(i, {
                gravity: [accel[0] ?? 0, accel[1] ?? -9.81, accel[2] ?? 0],
                dt_sub: time.stepDt / substeps,
                mu,
                lambda_lame: lambda,
                fixed_scale: MPM_FIXED_SCALE,
                particle_mass: physics.particleMass,
                particle_volume: physics.particleVolume,
                bulk_modulus: physics.bulkModulus,
                viscosity: physics.viscosity,
                dt_frame: time.stepDt,
                particle_count: count,
                grid_x: this.grid.gridDim[0],
                grid_y: this.grid.gridDim[1],
                grid_z: this.grid.gridDim[2],
                grid_origin: this.grid.origin,
                cell_size: this.grid.cellSize,
                open_bounds: physics.openBounds ? 1 : 0,
                material_id:
                    this.bodyType === 'MPMFluidSchema' ? MPM_MATERIAL_FLUID : MPM_MATERIAL_ELASTIC,
                substep_count: substeps,
                inv_dx: 1.0 / this.grid.cellSize,
                // Fim da iteração i (passo ⌊i/substeps⌋): o mesmo tempo em qualquer taxa (spec 009).
                field_time:
                    time.stepTime(Math.floor(i / substeps))
                    + ((i % substeps) + 1) * (time.stepDt / substeps),
                field_density: physics.particleMass / physics.particleVolume,
            });
        }
        this.params.flush(this.iterations);
    }
}

function gridKeyOf(grid: ReturnType<ParticlePhysics['gridFor']>): string {
    return `${grid.cellSize}|${grid.gridDim.join(',')}|${grid.origin.join(',')}`;
}
