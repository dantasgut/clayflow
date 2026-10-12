import type { EngineCore, Frame } from '../../../scene/contracts/gpu';
import type { PipelineDescriptor } from '../../../scene/descriptors/PipelineDescriptor';
import { Flow } from '../../../scene/flows/Flow';
import type {
    BindingSources,
    BoundFlow,
    TransitionContext,
} from '../../../scene/flows/FlowBinding';
import type { FlowContext } from '../../../scene/flows/FlowRegistry';
import type { FlowTransitions } from '../../../scene/flows/FlowTransitions';
import {
    slot,
    type BodiesSlot,
    type PoolSlot,
    type SingletonSlot,
    type SlotMap,
} from '../../../scene/flows/slots';
import { Time } from '../../../scene/time/Time';
import { DistanceConstraint } from '../constraints/DistanceConstraint';
import { GravityField } from '../forcefields/GravityField';
import { SimParamsSchema } from '../schemas/simParams';
import { xpbdDistanceSolve, xpbdPredict, xpbdVelocityUpdate } from '../shaders/xpbd';
import { PerStepUniforms } from './PerStepUniforms';

/** Opções do `XPBDFlow`. */
export interface XPBDFlowOptions {
    /** Pool das restrições de distância (padrão `DistanceConstraint`). */
    readonly constraintPoolKey?: string;
    /** Substeps por passo de física (padrão 8). O passo vem do `Time` da cena. */
    readonly substeps?: number;
    /** Iterações do solver de restrições por substep (padrão 1). */
    readonly solverIters?: number;
}

/** Slots do XPBD. */
export interface XPBDSlots extends SlotMap {
    /** Pool de corpos do `bodyType` do registro. */
    readonly bodies: BodiesSlot;
    /** Relógio da cena (passos fixos do quadro). */
    readonly time: SingletonSlot<false>;
    /** Pool das restrições de distância (opcional). */
    readonly constraints: PoolSlot<true>;
    /** Campo de gravidade (opcional; padrão `[0, −9,81, 0]`). */
    readonly gravity: SingletonSlot<true>;
}

function slotsOf(constraintPoolKey: string): XPBDSlots {
    return {
        bodies: slot.bodies(),
        time: slot.singleton(Time.schema),
        constraints: slot.pool(constraintPoolKey, { optional: true }),
        gravity: slot.singleton(GravityField.schema, { optional: true }),
    };
}

type Ctx = TransitionContext<XPBDSlots>;

/** Pipeline de restrições, preparado só com o pool de restrições. */
const DISTANCE = 'xpbd_distance_solve';

/**
 * XPBDFlow — corpos macios por XPBD (partículas + restrições de distância). O quadro executa `time.steps × substeps`
 * iterações (predict → solve → atualização de velocidade), cada uma com a sua região de `SimParams`
 * (`dt = time.stepDt / substeps`) ligada por offset dinâmico.
 *
 * Slots: o pool de corpos do `bodyType` do registro, o `Time`, o pool de restrições (opcional) e o `GravityField`
 * (opcional, padrão `[0, −9,81, 0]`). Os pipelines de predição e velocidade são declarados; o de restrições é
 * preparado numa transição quando o pool de restrições existe. Os parâmetros por iteração são escritos em
 * `framePrepare` — o `dispatch` só grava.
 */
export class XPBDFlow extends Flow<XPBDSlots, 'running'> {
    readonly type = 'XPBDFlow';
    readonly slots: XPBDSlots;
    override readonly pipelines: readonly PipelineDescriptor[];
    override readonly bindings: BindingSources;
    protected readonly initialState = 'running' as const;
    protected readonly transitions: FlowTransitions<'running', TransitionContext<XPBDSlots>>;

    private readonly core: EngineCore;
    private readonly substeps: number;
    private readonly solverIters: number;
    private readonly params: PerStepUniforms;
    private readonly distance: PipelineDescriptor;

    constructor(ctx: FlowContext, options: XPBDFlowOptions = {}) {
        super();
        this.core = ctx.core;
        const bodyType = ctx.bodyType ?? 'XPBDSoftSchema';
        const constraintPoolKey = options.constraintPoolKey ?? DistanceConstraint.schema.name;
        this.substeps = Math.max(1, options.substeps ?? 8);
        this.solverIters = Math.max(1, options.solverIters ?? 1);
        this.slots = slotsOf(constraintPoolKey);
        this.params = new PerStepUniforms(ctx.core, {
            discriminator: 'xpbd_sim_params',
            schema: SimParamsSchema,
        });
        this.params.reserve(this.substeps);
        this.bindings = { params: this.params.source() };
        this.pipelines = [
            {
                id: 'xpbd_predict',
                role: 'compute',
                shader: xpbdPredict,
                entryPoints: ['predict_main'],
                consumes: [bodyType],
            },
            {
                id: 'xpbd_velocity_update',
                role: 'compute',
                shader: xpbdVelocityUpdate,
                entryPoints: ['velocity_update_main'],
                consumes: [bodyType],
            },
        ];
        this.distance = {
            id: DISTANCE,
            role: 'compute',
            shader: xpbdDistanceSolve,
            entryPoints: ['distance_solve_main'],
            consumes: [bodyType, constraintPoolKey],
        };
        const constraints = {
            to: 'running' as const,
            run: (_e: unknown, c: Ctx) => {
                this.prepareConstraints(c);
            },
        };
        this.transitions = {
            '*': {
                slotsResolved: constraints,
                slotChanged: constraints,
                slotLost: 'ignore',
                pipelinesCompiled: 'ignore',
                bindGroupReplaced: 'ignore',
                poolReallocated: 'ignore',
                framePrepare: {
                    to: 'running',
                    run: (_e, c) => {
                        this.writeParams(c);
                    },
                },
            },
        };
    }

    /** Grava as iterações do quadro com a região de parâmetros de cada uma. */
    dispatch(frame: Frame, bound: BoundFlow<XPBDSlots>): void {
        const iterations = this.iterations(bound);
        const count = bound.slots.bodies.count;
        if (iterations === 0 || count === 0) return;
        const predict = bound.compute('xpbd_predict');
        const velocity = bound.compute('xpbd_velocity_update');
        const prepared = bound.pipelines.get(DISTANCE);
        const distance = prepared?.role === 'compute' && prepared.ready ? prepared : undefined;
        const solve = distance !== undefined && (bound.slots.constraints?.count ?? 0) > 0;
        for (let i = 0; i < iterations; i++) {
            const offset = [this.params.offset(i)];
            frame.compute('XPBDFlow.predict', (pass) => {
                pass.bind.setPipeline(predict.spec).setBindGroup(0, predict.groups[0]!, offset);
                pass.dispatch.invocations(count, 64);
            });
            if (solve) {
                for (let it = 0; it < this.solverIters; it++) {
                    frame.compute('XPBDFlow.distance_solve', (pass) => {
                        pass.bind
                            .setPipeline(distance.spec)
                            .setBindGroup(0, distance.groups[0]!, offset);
                        pass.dispatch.workgroups(1);
                    });
                }
            }
            frame.compute('XPBDFlow.velocity_update', (pass) => {
                pass.bind.setPipeline(velocity.spec).setBindGroup(0, velocity.groups[0]!, offset);
                pass.dispatch.invocations(count, 64);
            });
        }
    }

    /** Libera os parâmetros por iteração. */
    override dispose(): void {
        this.params.dispose();
    }

    private iterations(bound: BoundFlow<XPBDSlots>): number {
        return ((bound.slots.time.resource as Time).steps ?? 0) * this.substeps;
    }

    /** O pipeline de restrições existe enquanto o pool de restrições existe. */
    private prepareConstraints(ctx: Ctx): void {
        if (ctx.bound.slots.constraints !== undefined) ctx.prepare(this.distance);
        else ctx.release(DISTANCE);
    }

    /** Uma região de `SimParams` por iteração do quadro; uma escrita. O buffer cresce aqui, fora da gravação. */
    private writeParams(ctx: Ctx): void {
        const bound = ctx.bound;
        const iterations = this.iterations(bound);
        if (iterations === 0) return;
        if (this.params.reserve(iterations)) ctx.bind({ params: this.params.source() });
        const time = bound.slots.time.resource as Time;
        const dt = time.stepDt / this.substeps;
        const accel = (bound.slots.gravity?.resource.data.acceleration as
            | readonly number[]
            | undefined) ?? [0, -9.81, 0, 0];
        const count = bound.slots.bodies.count;
        const constraintCount = bound.slots.constraints?.count ?? 0;
        for (let i = 0; i < iterations; i++) {
            this.params.write(i, {
                gravity: [accel[0] ?? 0, accel[1] ?? -9.81, accel[2] ?? 0],
                dt,
                restitution: 0.2,
                damping: 0.05,
                particle_radius: 0.05,
                particle_count: count,
                constraint_count: constraintCount,
            });
        }
        this.params.flush(iterations);
    }
}
