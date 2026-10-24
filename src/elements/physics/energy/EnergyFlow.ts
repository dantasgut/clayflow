import type { Frame } from '../../../scene/contracts/gpu';
import type { ResourceDirectory } from '../../../scene/contracts/ResourceDirectory';
import type { PipelineDescriptor } from '../../../scene/descriptors/PipelineDescriptor';
import { Flow } from '../../../scene/flows/Flow';
import type { BoundFlow, TransitionContext } from '../../../scene/flows/FlowBinding';
import type { FlowContext } from '../../../scene/flows/FlowRegistry';
import type { FlowTransitions } from '../../../scene/flows/FlowTransitions';
import {
    slot,
    type ChannelSlot,
    type PoolSlot,
    type SingletonSlot,
    type SlotMap,
} from '../../../scene/flows/slots';
import { WORKGROUP_SIZE } from '../../../scene/shaders/engineConstants';
import { Time } from '../../../scene/time/Time';
import { LCPSchema } from '../bodies/schemas/LCPSchema';
import { GravityField } from '../forcefields/GravityField';
import { EnergyMeter } from './EnergyMeter';
import { BODY_ENERGY_HISTORY, BodyEnergySchema } from './schemas';
import { bodyEnergy, bodyEnergySlots } from './shaders';

/** Slots do estágio da energia. */
export interface EnergySlots extends SlotMap {
    /** O medidor (sem ele, o estágio fica pendente: nada calculado nem alocado). */
    readonly meter: SingletonSlot<false>;
    /** Os corpos do LCP. */
    readonly bodies: PoolSlot<false>;
    /** O tempo da cena (os passos do quadro). */
    readonly time: SingletonSlot<false>;
    /** A gravidade uniforme (sem ela, a padrão do solver: 0, −9,81, 0). */
    readonly gravity: SingletonSlot<true>;
    /** A série da energia (o canal do pool `BodyEnergy`). */
    readonly bodyEnergy: ChannelSlot<false>;
}

type Ctx = TransitionContext<EnergySlots>;

const PIPELINE: PipelineDescriptor = {
    id: 'body_energy',
    role: 'compute',
    shader: bodyEnergy,
    entryPoints: ['body_energy_main'],
};

/**
 * EnergyFlow — a série temporal da energia dos corpos rígidos (spec 037: o canal temporal da C2 no lugar do "anterior"
 * guardado à mão). Na fase `physics`, depois do solver, só com um `EnergyMeter` na cena: pede o pool `BodyEnergy` (8
 * fatias por corpo, no slot dele), escreve a gravidade, o tempo simulado e os passos já gravados no medidor e calcula a
 * fatia do passo. O anel gira só nos quadros com passo de física — a série segue o tempo simulado, não o quadro.
 */
export class EnergyFlow extends Flow<EnergySlots, 'idle'> {
    readonly type = 'EnergyFlow';
    readonly slots: EnergySlots = {
        meter: slot.singleton(EnergyMeter.schema),
        bodies: slot.pool(LCPSchema.name),
        time: slot.singleton(Time.schema),
        gravity: slot.singleton(GravityField.schema, { optional: true }),
        ...bodyEnergySlots,
    };
    override readonly pipelines: readonly PipelineDescriptor[] = [PIPELINE];
    protected readonly initialState = 'idle' as const;
    protected readonly transitions: FlowTransitions<'idle', Ctx>;

    private readonly resources: ResourceDirectory;
    /** Passos de física no quadro (0: nada a gravar). */
    private steps = 0;

    constructor(ctx: FlowContext) {
        super();
        this.resources = ctx.resources;
        this.transitions = {
            '*': {
                slotsResolved: {
                    to: 'idle',
                    run: () => {
                        this.resources.ensurePoolAllocated(BodyEnergySchema.name);
                    },
                },
                framePrepare: {
                    to: 'idle',
                    run: (_e, c) => {
                        this.prepare(c);
                    },
                },
                slotChanged: 'ignore',
                slotLost: 'ignore',
                pipelinesCompiled: 'ignore',
                bindGroupReplaced: 'ignore',
                poolReallocated: 'ignore',
            },
        };
    }

    dispatch(frame: Frame, bound: BoundFlow<EnergySlots>): void {
        const count = bound.slots.bodies.count;
        if (this.steps === 0 || count === 0) return;
        const p = bound.compute(PIPELINE.id);
        frame.compute('EnergyFlow', (pass) => {
            pass.bind.setPipeline(p.spec);
            p.bindTo(pass.bind);
            pass.dispatch.invocations(count, WORKGROUP_SIZE.value);
        });
        bound.slots.bodyEnergy.written();
    }

    private prepare(c: Ctx): void {
        const meter = c.bound.slots.meter.resource as EnergyMeter;
        const time = c.bound.slots.time.resource as Time;
        const gravity = c.bound.slots.gravity?.resource as GravityField | undefined;
        const g = gravity?.uniformAcceleration() ?? [0, -9.81, 0, 0];
        this.steps = time.data.steps;
        meter.data.gravity = [g[0] ?? 0, g[1] ?? 0, g[2] ?? 0, time.data.stepDt * time.data.steps];
        meter.data.counts = [
            c.bound.slots.bodies.count,
            c.bound.slots.bodyEnergy.frames,
            BODY_ENERGY_HISTORY,
            0,
        ];
    }
}
