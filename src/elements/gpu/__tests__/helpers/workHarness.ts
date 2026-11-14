import type { Frame } from '../../../../scene/contracts/gpu';
import { DefaultEventBus } from '../../../../scene/events/DefaultEventBus';
import { StructSchema } from '../../../../scene/descriptors/StructSchema';
import { Flow } from '../../../../scene/flows/Flow';
import type { BoundFlow, TransitionContext } from '../../../../scene/flows/FlowBinding';
import type { FlowTransitions } from '../../../../scene/flows/FlowTransitions';
import { FlowWork, type WorkContext } from '../../../../scene/flows/FlowWork';
import { slot, type WorkSlot } from '../../../../scene/flows/slots';
import { ResourceSystem } from '../../../../scene/systems/ResourceSystem';
import { World } from '../../../../scene/world/World';
import { memoryCore } from '../../../../scene/__tests__/helpers/memoryCore';

/** Resource de trabalho dos testes dos auxiliares. */
export class HarnessWork extends FlowWork {
    static readonly schema = new StructSchema('HarnessWork', {});
}

interface HarnessSlots {
    readonly [name: string]: WorkSlot<HarnessWork>;
    readonly work: WorkSlot<HarnessWork>;
}

/** O Flow dono do trabalho (T060g): a C2 entrega os pipelines dele às partes. Não grava nada. */
class HarnessFlow extends Flow<HarnessSlots, 'idle'> {
    readonly type = 'HarnessFlow';
    readonly slots: HarnessSlots;
    protected readonly initialState = 'idle' as const;
    protected readonly transitions: FlowTransitions<'idle', TransitionContext<HarnessSlots>> = {
        '*': { slotsResolved: 'ignore', pipelinesCompiled: 'ignore' },
    };
    constructor(work: HarnessWork) {
        super();
        this.slots = { work: slot.work(() => work) };
    }
    dispatch(_frame: Frame, _bound: BoundFlow<HarnessSlots>): void {}
}

/**
 * Cena mínima para testar uma parte do espaço de trabalho (spec 039): a C2 real (`ResourceSystem`) sobre o core com
 * memória, um `HarnessWork` de um Flow registrado (a C2 o insere e entrega os pipelines do Flow, T060g) e o
 * `WorkContext` para o auxiliar. `frame()` emite `frameRecording` (envio dos sujos e a reconciliação dos Flows).
 */
export function workHarness() {
    const events = new DefaultEventBus();
    const world = new World(events);
    const { core, bytesOf, copies } = memoryCore();
    const resources = new ResourceSystem(core, events, world);
    const work = new HarnessWork();
    resources.ensureFlowAllocated(new HarnessFlow(work), { type: 'HarnessFlow', phase: 'physics' });
    const ctx: WorkContext = { core, resources, work };
    const frame = (): void => {
        events.emit('frameRecording', { elapsed: 0 });
    };
    return { ctx, core, resources, world, work, events, bytesOf, copies, frame };
}

/**
 * Nome de um objeto de GPU criado nos testes: o do pipeline de uma parte (`HarnessFlow:<prefixo>#n`, a C2) como
 * `<prefixo>_pipeline`; os demais pelo discriminator ('' sem ele).
 */
export function specName(spec: unknown): string {
    const { discriminator, kind } = spec as { discriminator?: string; kind?: string };
    const d = discriminator ?? '';
    if (kind !== 'pipeline' || !d.startsWith('HarnessFlow:')) return d;
    return `${d.slice('HarnessFlow:'.length).replace(/#\d+$/, '')}_pipeline`;
}
