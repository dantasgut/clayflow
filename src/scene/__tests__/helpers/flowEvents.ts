import { expect } from 'vitest';
import { deliverFlowEvent, flowHandles, type Flow } from '../../flows/Flow';
import type { TransitionContext } from '../../flows/FlowBinding';
import {
    FlowTransitionError,
    type FlowEvent,
    type FlowEventName,
} from '../../flows/FlowTransitions';
import type { SlotDeclaration } from '../../flows/slots';

/** Todos os eventos de Flow. */
export const ALL_FLOW_EVENTS: readonly FlowEventName[] = [
    'slotsResolved',
    'slotLost',
    'slotChanged',
    'pipelinesCompiled',
    'bindGroupReplaced',
    'entitiesChanged',
    'canvasReconfigured',
    'poolReallocated',
    'resourceReady',
    'framePrepare',
    'frameRecorded',
];

function required(decl: SlotDeclaration): boolean {
    switch (decl.kind) {
        case 'pool':
        case 'singleton':
        case 'texture':
            return !decl.optional;
        case 'bodies':
        case 'target':
            return true;
        default:
            return false;
    }
}

/**
 * Eventos que a C2 pode entregar ao Flow, pelas regras de entrega: sempre `slotsResolved`, `pipelinesCompiled` e
 * `bindGroupReplaced`; `slotLost` com slot obrigatório; `slotChanged` com slot opcional (ou `pools`);
 * `poolReallocated` com slot de pool; `entitiesChanged` com `entities`; `canvasReconfigured` com alvo;
 * `resourceReady` com `listens`. `framePrepare`/`frameRecorded` são opt-in (só quem os declara os recebe).
 */
export function deliverableEvents(flow: Flow): Set<FlowEventName> {
    const decls = Object.values(flow.slots);
    const out = new Set<FlowEventName>(['slotsResolved', 'pipelinesCompiled', 'bindGroupReplaced']);
    if (decls.some(required)) out.add('slotLost');
    if (decls.some((d) => !required(d) && d.kind !== 'entities')) out.add('slotChanged');
    if (decls.some((d) => d.kind === 'pool' || d.kind === 'bodies' || d.kind === 'pools'))
        out.add('poolReallocated');
    if (decls.some((d) => d.kind === 'entities')) out.add('entitiesChanged');
    if (decls.some((d) => d.kind === 'target')) out.add('canvasReconfigured');
    if (flow.listens.length > 0) out.add('resourceReady');
    return out;
}

/** Evento mínimo do tipo dado (para a entrega direta nos testes de tabela). */
function eventOf(type: FlowEventName): FlowEvent {
    return { type } as FlowEvent;
}

/**
 * Contrato da tabela de transições do Flow: declara todo evento que a C2 pode lhe entregar (nenhum
 * `FlowTransitionError` em execução) e todo evento fora da tabela lança `FlowTransitionError` com o estado e o nome.
 */
export function expectTransitionTable(flow: Flow): void {
    const deliverable = deliverableEvents(flow);
    const missing = [...deliverable].filter((e) => !flowHandles(flow, e));
    expect(missing, `${flow.type}: eventos entregáveis sem transição`).toEqual([]);
    const ctx = {} as TransitionContext;
    for (const name of ALL_FLOW_EVENTS.filter((e) => !flowHandles(flow, e))) {
        let error: unknown;
        try {
            deliverFlowEvent(flow, eventOf(name), ctx);
        } catch (e) {
            error = e;
        }
        expect(error, `${flow.type}: '${name}' fora da tabela deveria lançar`).toBeInstanceOf(
            FlowTransitionError,
        );
        expect((error as FlowTransitionError).event).toBe(name);
        expect((error as FlowTransitionError).state).toBe(flow.state);
    }
}
