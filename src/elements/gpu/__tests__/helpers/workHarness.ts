import { DefaultEventBus } from '../../../../scene/events/DefaultEventBus';
import { StructSchema } from '../../../../scene/descriptors/StructSchema';
import { FlowWork, type WorkContext } from '../../../../scene/flows/FlowWork';
import { ResourceSystem } from '../../../../scene/systems/ResourceSystem';
import { World } from '../../../../scene/world/World';
import { memoryCore } from '../../../../scene/__tests__/helpers/memoryCore';

/** Resource de trabalho dos testes dos auxiliares. */
export class HarnessWork extends FlowWork {
    static readonly schema = new StructSchema('HarnessWork', {});
}

/**
 * Cena mínima para testar uma parte do espaço de trabalho (spec 039): a C2 real (`ResourceSystem`) sobre o core com
 * memória, um `HarnessWork` já inserido e o `WorkContext` para o auxiliar. `frame()` emite `frameRecording` (envio
 * dos sujos).
 */
export function workHarness() {
    const events = new DefaultEventBus();
    const world = new World(events);
    const { core, bytesOf, copies } = memoryCore();
    const resources = new ResourceSystem(core, events, world);
    const work = new HarnessWork();
    world.insert(work);
    const ctx: WorkContext = { core, resources, work };
    const frame = (): void => {
        events.emit('frameRecording', { elapsed: 0 });
    };
    return { ctx, core, resources, world, work, events, bytesOf, copies, frame };
}
