import type { Frame } from '../../../scene/contracts/gpu';
import type { PipelineDescriptor } from '../../../scene/descriptors/PipelineDescriptor';
import { StructSchema } from '../../../scene/descriptors/StructSchema';
import { Flow } from '../../../scene/flows/Flow';
import { FlowWork, type WorkContext } from '../../../scene/flows/FlowWork';
import type { BoundFlow, TransitionContext } from '../../../scene/flows/FlowBinding';
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
import { Time } from '../../../scene/time/Time';
import { DistanceConstraint, XPBD_SERIAL_COLOR } from '../constraints/DistanceConstraint';
import { GravityField } from '../forcefields/GravityField';
import { SimParamsSchema } from '../schemas/simParams';
import { xpbdCollide, xpbdDistanceSolve, xpbdPredict, xpbdVelocityUpdate } from '../shaders/xpbd';
import { Collider } from '../colliders/Collider';
import { COLLIDER_POOL_KEYS, ColliderSet } from '../colliders/ColliderSet';
import { LCPSchema } from '../bodies/schemas/LCPSchema';
import { PerStepUniforms } from '../../gpu/compute/PerStepUniforms';
import { SoftBodyRangeSchema } from '../energy/schemas';

/** Regiões de parâmetros por iteração: a do substep (predição, corpos, velocidade) e a das avulsas (spec 034, T061b). */
const COLOR_SLOTS = 2;
/** Iterações das restrições por substep (medido: com 1 o pano preso por dois cantos ganha energia; com 4, ≤ 1 %). */
const SOLVER_ITERATIONS = 4;
/** Invocações do grupo de um corpo nas restrições (`XPBD_BODY_THREADS`, `distance_solve.wgsl`). */
const BODY_THREADS = 256;

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
    /** As faixas dos corpos moles (um grupo de trabalho por corpo nas restrições; spec 034 T061b). */
    readonly ranges: PoolSlot<true>;
    /** Campo de gravidade (opcional; padrão `[0, −9,81, 0]`). */
    readonly gravity: SingletonSlot<true>;
    /** Pools dos colliders e dos corpos donos (spec 010: as partículas colidem com os colliders). */
    readonly colliderPools: PoolsSlot;
    /** Entidades com collider. */
    readonly colliders: EntitiesSlot;
    /** O espaço de trabalho do solver: parâmetros por iteração e colliders (spec 039). */
    readonly work: WorkSlot<XPBDWork>;
}

/** Resource de trabalho do `XPBDFlow` (spec 039). */
class XPBDWork extends FlowWork {
    static readonly schema = new StructSchema('XPBDWork', {});
}

function slotsOf(constraintPoolKey: string, work: XPBDWork): XPBDSlots {
    return {
        bodies: slot.bodies(),
        time: slot.singleton(Time.schema),
        constraints: slot.pool(constraintPoolKey, { optional: true }),
        ranges: slot.pool(SoftBodyRangeSchema.name, { optional: true }),
        gravity: slot.singleton(GravityField.schema, { optional: true }),
        colliderPools: slot.pools([...COLLIDER_POOL_KEYS, LCPSchema.name]),
        colliders: slot.entities({ all: [Collider] }),
        work: slot.work(() => work),
    };
}

type Ctx = TransitionContext<XPBDSlots>;

/** Pipelines de restrições (por corpo e as avulsas), preparados só com o pool de restrições. */
const DISTANCE = 'xpbd_distance_solve';
const DISTANCE_SERIAL = 'xpbd_distance_solve_serial';

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
    protected readonly initialState = 'running' as const;
    protected readonly transitions: FlowTransitions<'running', TransitionContext<XPBDSlots>>;

    private readonly substeps: number;
    private readonly solverIters: number;
    private readonly params: PerStepUniforms;
    private readonly distance: PipelineDescriptor;
    private readonly distanceSerial: PipelineDescriptor;
    private readonly colliderSet: ColliderSet;
    /** Colliders na cena no quadro: grava o passe de colisão (spec 010). */
    private collide = false;
    /** Há restrições avulsas na cena (a cor serial; spec 034 T061b). */
    private serial = false;
    private readonly world: FlowContext['world'];

    constructor(ctx: FlowContext, options: XPBDFlowOptions = {}) {
        super();
        const work = new XPBDWork();
        const wctx: WorkContext = { core: ctx.core, resources: ctx.resources, work };
        const constraintPoolKey = options.constraintPoolKey ?? DistanceConstraint.schema.name;
        this.substeps = Math.max(1, options.substeps ?? 8);
        this.solverIters = Math.max(1, options.solverIters ?? SOLVER_ITERATIONS);
        this.slots = slotsOf(constraintPoolKey, work);
        this.params = new PerStepUniforms(wctx, { id: 'xpbd_sim_params', schema: SimParamsSchema });
        this.params.reserve(this.substeps * COLOR_SLOTS);
        this.colliderSet = new ColliderSet(wctx, ctx.world, { discriminator: 'xpbd_colliders' });
        this.world = ctx.world;
        this.pipelines = [
            {
                id: 'xpbd_predict',
                role: 'compute',
                shader: xpbdPredict,
                entryPoints: ['predict_main'],
            },
            {
                id: 'xpbd_collide',
                role: 'compute',
                shader: xpbdCollide,
                entryPoints: ['xpbd_collide_main'],
            },
            {
                id: 'xpbd_velocity_update',
                role: 'compute',
                shader: xpbdVelocityUpdate,
                entryPoints: ['velocity_update_main'],
            },
        ];
        this.distance = {
            id: DISTANCE,
            role: 'compute',
            shader: xpbdDistanceSolve,
            entryPoints: ['distance_solve_body_main'],
        };
        this.distanceSerial = {
            id: DISTANCE_SERIAL,
            role: 'compute',
            shader: xpbdDistanceSolve,
            entryPoints: ['distance_solve_serial_main'],
        };
        const constraints = {
            to: 'running' as const,
            run: (_e: unknown, c: Ctx) => {
                this.prepareConstraints(c);
                this.colliderSet.markDirty();
                this.syncColliders(c);
            },
        };
        this.transitions = {
            '*': {
                slotsResolved: constraints,
                slotChanged: constraints,
                slotLost: 'ignore',
                pipelinesCompiled: 'ignore',
                bindGroupReplaced: 'ignore',
                // Pool recriado: os colliders religam os buffers que mudaram; o pipeline de restrições segue o slot.
                poolReallocated: {
                    to: 'running',
                    run: (e, c) => {
                        if (e.type === 'poolReallocated')
                            this.colliderSet.onPoolReallocated(e.poolKey);
                        constraints.run(e, c);
                    },
                },
                // Entidades com collider entram/saem em massa: só marca; a reconstrução é uma por quadro.
                entitiesChanged: {
                    to: 'running',
                    run: () => {
                        this.colliderSet.markDirty();
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
    }

    /** Grava as iterações do quadro com a região de parâmetros de cada uma. */
    dispatch(frame: Frame, bound: BoundFlow<XPBDSlots>): void {
        const iterations = this.iterations(bound);
        const count = bound.slots.bodies.count;
        if (iterations === 0 || count === 0) return;
        const predict = bound.compute('xpbd_predict');
        const velocity = bound.compute('xpbd_velocity_update');
        const collide = bound.compute('xpbd_collide');
        const prepared = bound.pipelines.get(DISTANCE);
        const distance = prepared?.role === 'compute' && prepared.ready ? prepared : undefined;
        const preparedSerial = bound.pipelines.get(DISTANCE_SERIAL);
        const serial =
            preparedSerial?.role === 'compute' && preparedSerial.ready ? preparedSerial : undefined;
        const ranges = bound.slots.ranges?.count ?? 0;
        const solve =
            distance !== undefined && (bound.slots.constraints?.count ?? 0) > 0 && ranges > 0;
        for (let i = 0; i < iterations; i++) {
            const offset = [this.params.offset(i * COLOR_SLOTS)];
            frame.compute('XPBDFlow.predict', (pass) => {
                pass.bind.setPipeline(predict.spec);
                predict.bindTo(pass.bind, { draw: offset });
                pass.dispatch.invocations(count, WORKGROUP_SIZE.value);
            });
            if (solve) {
                // Um grupo de trabalho por corpo: as cores e as iterações dentro dele (Gauss-Seidel por cor).
                frame.compute('XPBDFlow.distance_solve', (pass) => {
                    pass.bind.setPipeline(distance.spec);
                    distance.bindTo(pass.bind, { draw: offset });
                    pass.dispatch.invocations(ranges * BODY_THREADS, BODY_THREADS);
                });
                if (this.serial && serial !== undefined)
                    frame.compute('XPBDFlow.distance_solve_serial', (pass) => {
                        pass.bind.setPipeline(serial.spec);
                        serial.bindTo(pass.bind, {
                            draw: [this.params.offset(i * COLOR_SLOTS + 1)],
                        });
                        pass.dispatch.workgroups(1);
                    });
            }
            if (this.collide)
                frame.compute('XPBDFlow.collide', (pass) => {
                    pass.bind.setPipeline(collide.spec);
                    collide.bindTo(pass.bind, { draw: offset });
                    pass.dispatch.invocations(count, WORKGROUP_SIZE.value);
                });
            frame.compute('XPBDFlow.velocity_update', (pass) => {
                pass.bind.setPipeline(velocity.spec);
                velocity.bindTo(pass.bind, { draw: offset });
                pass.dispatch.invocations(count, WORKGROUP_SIZE.value);
            });
        }
    }

    /** Reconstrói os mapas de dono dos colliders se sujos e religa as fontes que mudaram. */
    private syncColliders(ctx: Ctx): void {
        if (this.colliderSet.refresh()) ctx.bind(this.colliderSet.sources());
    }

    private iterations(bound: BoundFlow<XPBDSlots>): number {
        return ((bound.slots.time.resource as Time).steps ?? 0) * this.substeps;
    }

    /**
     * Há restrições avulsas (a cor serial, resolvida uma a uma)? Na mudança do slot de restrições (corpo ou restrição entrou
     * ou saiu), não por quadro; as cores dos corpos estão nas faixas deles.
     */
    private countSerial(): void {
        let serial = false;
        // Os corpos não têm schema de classe (não estão no índice por nome): os registros da cena, só nesta mudança.
        for (const record of this.world.allRecords())
            for (const r of record.resources) if (r instanceof DistanceConstraint) serial = true;
        this.serial = serial;
    }

    /** O pipeline de restrições existe enquanto o pool de restrições existe (o slot fornece o pool e o bitset dele). */
    private prepareConstraints(ctx: Ctx): void {
        this.countSerial();
        if (ctx.bound.slots.constraints === undefined) {
            ctx.release(DISTANCE);
            ctx.release(DISTANCE_SERIAL);
            return;
        }
        ctx.prepare(this.distance);
        ctx.prepare(this.distanceSerial);
    }

    /** Uma região de `SimParams` por iteração do quadro; uma escrita. O buffer cresce aqui, fora da gravação. */
    private writeParams(ctx: Ctx): void {
        const bound = ctx.bound;
        const iterations = this.iterations(bound);
        if (iterations === 0) return;
        // Uma região por iteração e cor das restrições (a C2 realoca e religa o fornecedor do trabalho quando cresce): a
        // região `i · COLOR_SLOTS` é a da predição e da velocidade; `i · COLOR_SLOTS + c`, a do despacho da cor `c`.
        this.params.reserve(iterations * COLOR_SLOTS);
        const time = bound.slots.time.resource as Time;
        const dt = time.stepDt / this.substeps;
        const accel = (
            bound.slots.gravity?.resource as GravityField | undefined
        )?.uniformAcceleration() ?? [0, -9.81, 0, 0];
        const count = bound.slots.bodies.count;
        const constraintCount = bound.slots.constraints?.count ?? 0;
        for (let r = 0; r < iterations * COLOR_SLOTS; r++) {
            const i = Math.floor(r / COLOR_SLOTS);
            this.params.write(r, {
                gravity: [accel[0] ?? 0, accel[1] ?? -9.81, accel[2] ?? 0],
                dt,
                restitution: 0.2,
                damping: 0.05,
                particle_radius: 0.05,
                particle_count: count,
                constraint_count: constraintCount,
                // Fim do substep i (passo ⌊i/substeps⌋): o mesmo tempo em qualquer taxa (spec 009).
                field_time:
                    time.stepTime(Math.floor(i / this.substeps)) + ((i % this.substeps) + 1) * dt,
                field_density: 0,
                constraint_color: r % COLOR_SLOTS === 1 ? XPBD_SERIAL_COLOR : 0,
                constraint_iterations: this.solverIters,
            });
        }
        this.params.flush(iterations * COLOR_SLOTS);
    }
}
