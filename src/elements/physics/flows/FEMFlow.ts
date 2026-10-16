import type { Frame } from '../../../scene/contracts/gpu';
import type { PipelineDescriptor } from '../../../scene/descriptors/PipelineDescriptor';
import { Flow } from '../../../scene/flows/Flow';
import type { BindingSource, BoundFlow, TransitionContext } from '../../../scene/flows/FlowBinding';
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
import { GravityField } from '../forcefields/GravityField';
import { FEMSimParamsSchema } from '../schemas/simParams';
import { femCollide, femPredict, femResources, femVelocityUpdate } from '../shaders/fem';
import { Collider } from '../colliders/Collider';
import { COLLIDER_POOL_KEYS, ColliderSet } from '../colliders/ColliderSet';
import { LCPSchema } from '../bodies/schemas/LCPSchema';
import { PerStepUniforms } from '../../gpu/compute/PerStepUniforms';

/** Opções do `FEMFlow`. */
export interface FEMFlowOptions {
    /** Substeps por passo de física (padrão 1). O passo vem do `Time` da cena. */
    readonly substeps?: number;
    /** Primeiro parâmetro de Lamé μ (rigidez ao cisalhamento, Pa). Padrão 5e3. */
    readonly mu?: number;
    /** Segundo parâmetro de Lamé λ (resistência à variação de volume, Pa). Padrão 5e3. */
    readonly lambda?: number;
    /** Amortecimento da velocidade por passo, em [0, 1]. Padrão 0,05. */
    readonly damping?: number;
}

/** Slots do FEM. */
export interface FEMSlots extends SlotMap {
    /** Pool de corpos do `bodyType` do registro. */
    readonly bodies: BodiesSlot;
    /** Relógio da cena (passos fixos do quadro). */
    readonly time: SingletonSlot<false>;
    /** Campo de gravidade (opcional; padrão `[0, −9,81, 0]`). */
    readonly gravity: SingletonSlot<true>;
    /** Pools dos colliders e dos corpos donos (spec 010: os nós colidem com os colliders). */
    readonly colliderPools: PoolsSlot;
    /** Entidades com collider. */
    readonly colliders: EntitiesSlot;
}

const slots: FEMSlots = {
    bodies: slot.bodies(),
    time: slot.singleton(Time.schema),
    gravity: slot.singleton(GravityField.schema, { optional: true }),
    colliderPools: slot.pools([...COLLIDER_POOL_KEYS, LCPSchema.name]),
    colliders: slot.entities({ all: [Collider] }),
};

type Ctx = TransitionContext<FEMSlots>;

/**
 * FEMFlow — corpos macios por elementos finitos (predict + atualização de velocidade). O quadro executa
 * `time.steps × substeps` iterações, cada uma com a sua região de `FEMSimParams` (`dt_sub = stepDt / substeps`,
 * `dt_frame = stepDt`) ligada por offset dinâmico.
 *
 * Slots: o pool de nós do `bodyType` do registro, o `Time` e o `GravityField` (opcional). Pipelines declarados (o pool vem
 * do slot `bodies`); parâmetros por iteração escritos em `framePrepare` — o `dispatch` só grava.
 */
export class FEMFlow extends Flow<FEMSlots, 'running'> {
    readonly type = 'FEMFlow';
    readonly slots = slots;
    override readonly pipelines: readonly PipelineDescriptor[];
    override readonly bindings: ReadonlyMap<WgslResource, BindingSource>;
    protected readonly initialState = 'running' as const;
    protected readonly transitions: FlowTransitions<'running', TransitionContext<FEMSlots>> = {
        '*': {
            slotsResolved: {
                to: 'running',
                run: (_e, c) => {
                    this.refreshColliders(c);
                },
            },
            slotChanged: {
                to: 'running',
                run: (_e, c) => {
                    this.refreshColliders(c);
                },
            },
            // Entidades com collider entram/saem em massa: só marca; a reconstrução é uma por quadro.
            entitiesChanged: {
                to: 'running',
                run: () => {
                    this.colliderSet.markDirty();
                },
            },
            slotLost: 'ignore',
            pipelinesCompiled: 'ignore',
            bindGroupReplaced: 'ignore',
            poolReallocated: {
                to: 'running',
                run: (e, c) => {
                    if (e.type === 'poolReallocated') this.colliderSet.onPoolReallocated(e.poolKey);
                    this.syncColliders(c);
                },
            },
            framePrepare: {
                to: 'running',
                run: (_e, c) => {
                    this.syncColliders(c);
                    this.collide = this.colliderSet.totalCount > 0;
                    this.writeParams(c);
                },
            },
        },
    };

    private readonly colliderSet: ColliderSet;
    /** Colliders na cena no quadro: grava o passe de colisão (spec 010). */
    private collide = false;

    private readonly substeps: number;
    private readonly mu: number;
    private readonly lambda: number;
    private readonly damping: number;
    private readonly params: PerStepUniforms;

    constructor(ctx: FlowContext, options: FEMFlowOptions = {}) {
        super();
        this.substeps = Math.max(1, options.substeps ?? 1);
        this.mu = options.mu ?? 5e3;
        this.lambda = options.lambda ?? 5e3;
        this.damping = options.damping ?? 0.05;
        this.params = new PerStepUniforms(ctx.core, {
            discriminator: 'fem_sim_params',
            schema: FEMSimParamsSchema,
        });
        this.params.reserve(this.substeps);
        this.bindings = new Map<WgslResource, BindingSource>([
            [femResources.params, this.params.source()],
        ]);
        this.colliderSet = new ColliderSet(ctx.core, ctx.world, ctx.resources, {
            discriminator: 'fem_colliders',
        });
        this.pipelines = [
            {
                id: 'fem_predict',
                role: 'compute',
                shader: femPredict,
                entryPoints: ['fem_predict_main'],
                consumes: [],
            },
            {
                id: 'fem_collide',
                role: 'compute',
                shader: femCollide,
                entryPoints: ['fem_collide_main'],
                consumes: [],
            },
            {
                id: 'fem_velocity_update',
                role: 'compute',
                shader: femVelocityUpdate,
                entryPoints: ['fem_velocity_update_main'],
                consumes: [],
            },
        ];
    }

    /** Grava as iterações do quadro com a região de parâmetros de cada uma. */
    dispatch(frame: Frame, bound: BoundFlow<FEMSlots>): void {
        const iterations = this.iterations(bound);
        const count = bound.slots.bodies.count;
        if (iterations === 0 || count === 0) return;
        const predict = bound.compute('fem_predict');
        const velocity = bound.compute('fem_velocity_update');
        const collide = bound.compute('fem_collide');
        for (let i = 0; i < iterations; i++) {
            const offset = [this.params.offset(i)];
            frame.compute('FEMFlow.predict', (pass) => {
                pass.bind.setPipeline(predict.spec);
                predict.bindTo(pass.bind, { draw: offset });
                pass.dispatch.invocations(count, WORKGROUP_SIZE.value);
            });
            if (this.collide)
                frame.compute('FEMFlow.collide', (pass) => {
                    pass.bind.setPipeline(collide.spec);
                    collide.bindTo(pass.bind, { draw: offset });
                    pass.dispatch.invocations(count, WORKGROUP_SIZE.value);
                });
            frame.compute('FEMFlow.velocity_update', (pass) => {
                pass.bind.setPipeline(velocity.spec);
                velocity.bindTo(pass.bind, { draw: offset });
                pass.dispatch.invocations(count, WORKGROUP_SIZE.value);
            });
        }
    }

    /** Libera os parâmetros por iteração e o conjunto de colliders. */
    override dispose(): void {
        this.params.dispose();
        this.colliderSet.destroy();
    }

    /** Mapas de dono e contagens dos colliders; religa as fontes do grupo de colliders. */
    private refreshColliders(ctx: Ctx): void {
        this.colliderSet.markDirty();
        this.syncColliders(ctx);
    }

    /** Reconstrói os mapas de dono se sujos e religa as fontes que mudaram. */
    private syncColliders(ctx: Ctx): void {
        if (this.colliderSet.refresh()) ctx.bind(this.colliderSet.sources());
    }

    private iterations(bound: BoundFlow<FEMSlots>): number {
        return (bound.slots.time.resource as Time).steps * this.substeps;
    }

    /** Uma região de `FEMSimParams` por iteração do quadro; uma escrita. O buffer cresce aqui, fora da gravação. */
    private writeParams(ctx: Ctx): void {
        const bound = ctx.bound;
        const iterations = this.iterations(bound);
        if (iterations === 0) return;
        if (this.params.reserve(iterations))
            ctx.bind(new Map([[femResources.params, this.params.source()]]));
        const time = bound.slots.time.resource as Time;
        const stepDt = time.stepDt;
        const accel = (
            bound.slots.gravity?.resource as GravityField | undefined
        )?.uniformAcceleration() ?? [0, -9.81, 0, 0];
        const count = bound.slots.bodies.count;
        for (let i = 0; i < iterations; i++) {
            this.params.write(i, {
                gravity: [accel[0] ?? 0, accel[1] ?? -9.81, accel[2] ?? 0],
                dt_sub: stepDt / this.substeps,
                mu: this.mu,
                lambda: this.lambda,
                damping: this.damping,
                alpha_h: 1.0 / Math.max(this.lambda + 2 * this.mu, 1e-6),
                alpha_d: 1.0 / Math.max(this.mu, 1e-6),
                dt_frame: stepDt,
                restitution: 0.2,
                // Raio dos nós na colisão com os colliders (spec 010).
                collision_radius: 0.05,
                node_count: count,
                solve_iters: 4,
                // Fim do substep i (passo ⌊i/substeps⌋): o mesmo tempo em qualquer taxa (spec 009).
                field_time:
                    time.stepTime(Math.floor(i / this.substeps))
                    + ((i % this.substeps) + 1) * (stepDt / this.substeps),
                field_density: 0,
            });
        }
        this.params.flush(iterations);
    }
}
