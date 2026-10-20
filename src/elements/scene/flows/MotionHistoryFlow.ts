import type { Frame } from '../../../scene/contracts/gpu';
import { Flow } from '../../../scene/flows/Flow';
import type { BoundFlow, TransitionContext } from '../../../scene/flows/FlowBinding';
import type { FlowTransitions } from '../../../scene/flows/FlowTransitions';
import { slot, type PoolSlot, type SlotMap } from '../../../scene/flows/slots';
import { Transform } from '../Transform';

/** Slots do estágio do histórico de movimento. */
export interface MotionHistorySlots extends SlotMap {
    /** Pool `WorldTransform` (o do quadro anterior, ainda intacto no início do quadro). */
    readonly worlds: PoolSlot<false>;
    /** Pool `PreviousWorldTransform` (saída: mesmo slot e layout). */
    readonly previous: PoolSlot<false>;
}

const slots: MotionHistorySlots = {
    worlds: slot.pool(Transform.worldSchema.name),
    previous: slot.pool(Transform.previousWorldSchema.name),
};

/**
 * Histórico de movimento (spec 034, R3): no início do quadro — fase `physics`, antes de qualquer solver ou do estágio de
 * transformação escreverem as matrizes de mundo — copia a `WorldTransform` de todos os slots para a
 * `PreviousWorldTransform`. O passe de movimento do desenho compara as duas (vetores de movimento por objeto do
 * antisserrilhado temporal). Uma cópia de buffer por quadro, sem kernel nem leitura de volta.
 */
export class MotionHistoryFlow extends Flow<MotionHistorySlots, 'idle'> {
    readonly type = 'MotionHistoryFlow';
    readonly slots = slots;
    protected readonly initialState = 'idle' as const;
    protected readonly transitions: FlowTransitions<'idle', TransitionContext<MotionHistorySlots>> =
        {
            '*': {
                slotsResolved: 'ignore',
                slotLost: 'ignore',
                slotChanged: 'ignore',
                pipelinesCompiled: 'ignore',
                bindGroupReplaced: 'ignore',
                poolReallocated: 'ignore',
            },
        };

    dispatch(frame: Frame, bound: BoundFlow<MotionHistorySlots>): void {
        const { worlds, previous } = bound.slots;
        const bytes = Math.min(worlds.count, previous.capacity) * worlds.stride;
        if (bytes <= 0) return;
        frame.copy(worlds.buffer, previous.buffer, bytes, 0, 0);
    }
}
