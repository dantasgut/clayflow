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
import { LCPSchema } from '../bodies/schemas/LCPSchema';
import { Collider } from '../colliders/Collider';
import { COLLIDER_POOLS, ColliderSet } from '../colliders/ColliderSet';
import { GravityField } from '../forcefields/GravityField';
import { ParticleMaterial } from '../materials/ParticleMaterial';
import { MPMSimParamsSchema } from '../schemas/simParams';
import { MPMGridNodeSchema } from '../schemas/simState';
import { mpmClearGrid, mpmG2P, mpmGridUpdate, mpmP2G, mpmParticleCollision } from '../shaders/mpm';
import { PerStepUniforms } from '../../gpu/compute/PerStepUniforms';

/** Escala do ponto fixo das somas atômicas da grade. */
const MPM_FIXED_SCALE = 1e7;
/** `material_id` do WGSL. */
const MPM_MATERIAL_ELASTIC = 0;
const MPM_MATERIAL_FLUID = 2;

/** Opções do `MPMFlow`. */
export interface MPMFlowOptions {
    /** Mínimo de substeps por passo (padrão 1); o passo estável do `ParticleMaterial` pode exigir mais. */
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
    /** Material das partículas (opcional; padrões do solver). */
    readonly material: SingletonSlot<true>;
    /** Pools de colliders e de corpos rígidos (cada um presente ou não). */
    readonly colliderPools: PoolsSlot;
    /** Entidades com collider (donos dos registros nos pools de collider). */
    readonly colliders: EntitiesSlot;
}

const slots: MPMSlots = {
    bodies: slot.bodies(),
    time: slot.singleton(Time.schema),
    gravity: slot.singleton(GravityField.schema, { optional: true }),
    material: slot.singleton(ParticleMaterial.schema, { optional: true }),
    colliderPools: slot.pools([...COLLIDER_POOLS.map((s) => s.name), LCPSchema.name]),
    colliders: slot.entities({ all: [Collider] }),
};

type Ctx = TransitionContext<MPMSlots>;

/**
 * MPMFlow — corpos por Material Point Method (MLS-MPM: limpa grade → P2G → atualização da grade → G2P → colisão):
 * fluido fracamente compressível (`MPMFluidSchema`) ou sólido neo-Hookean (`MPMSoftSchema`), conforme o `bodyType` do
 * registro. O quadro executa `time.steps × substeps` iterações, com `substeps` pelo passo estável do
 * `ParticleMaterial`, cada uma com a sua região de `MPMSimParams` (`dt = stepDt / substeps`, `dt_frame = stepDt`)
 * ligada por offset dinâmico. Massa, volume, grade (célula 2s sobre o domínio), módulo volumétrico e Lamé vêm do
 * material.
 *
 * Slots: pool de partículas, `Time`, `GravityField` e `ParticleMaterial` (opcionais), pools de collider e as
 * entidades com collider. Recursos privados — grade, parâmetros por iteração e o `ColliderSet` — são recriados e
 * religados em transições (`framePrepare` para grade e parâmetros; entidades/pools para os colliders), nunca no
 * `dispatch`.
 */
export class MPMFlow extends Flow<MPMSlots, 'running'> {
    readonly type = 'MPMFlow';
    readonly slots = slots;
    override readonly pipelines: readonly PipelineDescriptor[];
    override readonly bindings: BindingSources;
    protected readonly initialState = 'running' as const;
    protected readonly transitions: FlowTransitions<'running', TransitionContext<MPMSlots>>;

    private readonly core: EngineCore;
    private readonly bodyType: string;
    private readonly minSubsteps: number;
    private readonly params: PerStepUniforms;
    private readonly colliderSet: ColliderSet;
    private grid: ReturnType<ParticleMaterial['gridFor']>;
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
        const material = ParticleMaterial.defaults;
        this.grid = material.gridFor(material.mpmCellSize);
        this.gridKey = gridKeyOf(this.grid);
        this.gridBuffer = this.createGrid();
        this.bindings = { mpm_params: this.params.source(), grid: this.gridBuffer };
        const consumes = [this.bodyType, `${this.bodyType}.live`];
        this.pipelines = [
            {
                id: 'mpm_clear_grid',
                role: 'compute',
                shader: mpmClearGrid,
                entryPoints: ['mpm_clear_grid_main'],
                consumes,
            },
            {
                id: 'mpm_p2g',
                role: 'compute',
                shader: mpmP2G,
                entryPoints: ['mpm_p2g_main'],
                consumes,
            },
            {
                id: 'mpm_grid_update',
                role: 'compute',
                shader: mpmGridUpdate,
                entryPoints: ['mpm_grid_update_main'],
                consumes,
            },
            {
                id: 'mpm_g2p',
                role: 'compute',
                shader: mpmG2P,
                entryPoints: ['mpm_g2p_main'],
                consumes,
            },
            {
                id: 'mpm_particle_collision',
                role: 'compute',
                shader: mpmParticleCollision,
                entryPoints: ['mpm_particle_collision_main'],
                consumes,
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
                // Grupo com os parâmetros (offset dinâmico da iteração); demais grupos sem offset.
                p.groups.forEach((bg, g) =>
                    pass.bind.setBindGroup(g, bg, p.dynamic[g] ? offset : undefined),
                );
                pass.dispatch.invocations(invocations, 64);
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
     * Antes da gravação: grade pelo material (recriada e religada quando muda), substeps pelo passo estável e uma
     * região de `MPMSimParams` por iteração (crescimento e religação aqui, fora da gravação).
     */
    private prepareFrame(ctx: Ctx): void {
        const bound = ctx.bound;
        const time = bound.slots.time.resource as Time;
        const material =
            (bound.slots.material?.resource as ParticleMaterial | undefined)
            ?? ParticleMaterial.defaults;
        const grid = material.gridFor(material.mpmCellSize);
        const key = gridKeyOf(grid);
        if (key !== this.gridKey) {
            this.grid = grid;
            this.gridKey = key;
            this.core.destroy(this.gridBuffer);
            this.gridBuffer = this.createGrid();
            ctx.bind({ grid: this.gridBuffer });
        }
        const substeps = ParticleMaterial.substepsFor(
            time.stepDt,
            material.mpmStableDt,
            this.minSubsteps,
        );
        this.iterations = time.steps * substeps;
        if (this.iterations === 0) return;
        if (this.params.reserve(this.iterations)) ctx.bind({ mpm_params: this.params.source() });
        const accel = (
            bound.slots.gravity?.resource as GravityField | undefined
        )?.uniformAcceleration() ?? [0, -9.81, 0, 0];
        const { mu, lambda } = material.lame;
        const count = bound.slots.bodies.count;
        for (let i = 0; i < this.iterations; i++) {
            this.params.write(i, {
                gravity: [accel[0] ?? 0, accel[1] ?? -9.81, accel[2] ?? 0],
                dt_sub: time.stepDt / substeps,
                mu,
                lambda_lame: lambda,
                fixed_scale: MPM_FIXED_SCALE,
                particle_mass: material.particleMass,
                particle_volume: material.particleVolume,
                bulk_modulus: material.bulkModulus,
                viscosity: material.viscosity,
                dt_frame: time.stepDt,
                particle_count: count,
                grid_x: this.grid.gridDim[0],
                grid_y: this.grid.gridDim[1],
                grid_z: this.grid.gridDim[2],
                grid_origin: this.grid.origin,
                cell_size: this.grid.cellSize,
                material_id:
                    this.bodyType === 'MPMFluidSchema' ? MPM_MATERIAL_FLUID : MPM_MATERIAL_ELASTIC,
                substep_count: substeps,
                inv_dx: 1.0 / this.grid.cellSize,
                // Fim da iteração i (passo ⌊i/substeps⌋): o mesmo tempo em qualquer taxa (spec 009).
                field_time:
                    time.stepTime(Math.floor(i / substeps))
                    + ((i % substeps) + 1) * (time.stepDt / substeps),
                field_density: material.particleMass / material.particleVolume,
            });
        }
        this.params.flush(this.iterations);
    }
}

function gridKeyOf(grid: ReturnType<ParticleMaterial['gridFor']>): string {
    return `${grid.cellSize}|${grid.gridDim.join(',')}|${grid.origin.join(',')}`;
}
