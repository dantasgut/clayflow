// O Flow dono do espaço de trabalho de um smoke (T060g): as peças de compute (`PrefixSum`, a busca de vizinhos…) e os
// kernels do próprio smoke preparam e ligam pelos pipelines dele, pela C2 (`FlowWork.pipelines`) — nenhum kernel criado
// pelo core. O Flow não grava nada: quem grava é o smoke, com `work.pipelines.use`.
import { Flow, slot } from 'clayflow/web';
import type { Application, BoundFlow, FlowWork, Frame, WorkSlot } from 'clayflow/web';

class WorkOwnerFlow extends Flow<{ readonly work: WorkSlot<FlowWork> }, 'idle'> {
    readonly slots: { readonly work: WorkSlot<FlowWork> };
    protected readonly initialState = 'idle' as const;
    protected readonly transitions = {
        '*': {
            slotsResolved: 'ignore',
            slotChanged: 'ignore',
            slotLost: 'ignore',
            pipelinesCompiled: 'ignore',
            bindGroupReplaced: 'ignore',
        },
    } as const;

    constructor(
        readonly type: string,
        work: FlowWork,
    ) {
        super();
        this.slots = { work: slot.work(() => work) };
    }

    dispatch(_frame: Frame, _bound: BoundFlow): void {}
}

/**
 * Registra o Flow dono de `work` em `app` (a C2 insere o trabalho e entrega os pipelines do Flow) e espera a entrega.
 * @throws Error se a C2 não entregou os pipelines em alguns quadros.
 */
export function ownWork<W extends FlowWork>(app: Application, work: W, type: string): W {
    app.flows.register(() => new WorkOwnerFlow(type, work), {
        type,
        phase: 'transform',
        priority: -100,
    });
    for (let i = 0; i < 4; i++) {
        try {
            void work.pipelines;
            return work;
        } catch {
            app.step(0);
        }
    }
    void work.pipelines;
    return work;
}
