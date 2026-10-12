import type { BindGroupSpec } from '../../core/contracts/index';
import type { Resource } from '../contracts/Resource';
import type { Schema } from '../descriptors/Schema';
import type { EntityId } from '../world/EntityId';

/**
 * Eventos entregues pela Camada 2 a um Flow. Só a C2 os produz; o estado do Flow muda só pela tabela de transições
 * em reação a eles (FR-002).
 *
 * - `slotsResolved`: os slots obrigatórios passaram a existir (o Flow sai de `pending`); momento de criar recursos
 *   privados que dependem dos slots e ligá-los (`ctx.bind`).
 * - `slotLost`: um slot obrigatório deixou de existir (o Flow volta a `pending`).
 * - `slotChanged`: um slot opcional (ou um pool de `slot.pools`) apareceu, sumiu ou trocou de recurso.
 * - `pipelinesCompiled`: os pipelines declarados (ou um preparado em transição, `pipeline`) compilaram.
 * - `bindGroupReplaced`: a C2 recriou um bind group de um pipeline do Flow (fonte recriada).
 * - `entitiesChanged`: entraram ou saíram entidades de um slot `entities`.
 * - `canvasReconfigured`: o canvas mudou de tamanho (Flows com slot `target`).
 * - `poolReallocated`: um pool de um slot do Flow foi recriado (crescimento).
 * - `resourceReady`: um Resource de um schema de `listens` foi alocado ou enviado.
 * - `framePrepare`: o quadro vai ser gravado (dados enviados, slots e bind groups reconciliados) — momento das
 *   escritas por quadro de uniforms privados (parâmetros por passo, contagens). Entregue só a quem o declara.
 * - `frameRecorded`: o quadro em que o Flow gravou foi enviado — entregue só aos Flows cuja tabela declara o evento
 *   (ex.: um estágio reativo que volta a "limpo" depois de gravar o trabalho pendente).
 */
export type FlowEvent =
    | { readonly type: 'slotsResolved' }
    | { readonly type: 'slotLost'; readonly slot: string }
    | { readonly type: 'slotChanged'; readonly slot: string }
    | { readonly type: 'pipelinesCompiled'; readonly pipeline?: string }
    | {
          readonly type: 'bindGroupReplaced';
          readonly pipeline: string;
          readonly group: number;
          readonly oldSpec: BindGroupSpec;
          readonly newSpec: BindGroupSpec;
      }
    | {
          readonly type: 'entitiesChanged';
          readonly slot: string;
          readonly added: readonly EntityId[];
          readonly removed: readonly EntityId[];
      }
    | { readonly type: 'canvasReconfigured'; readonly width: number; readonly height: number }
    | { readonly type: 'poolReallocated'; readonly poolKey: string }
    | { readonly type: 'resourceReady'; readonly schema: Schema; readonly resource: Resource }
    | { readonly type: 'framePrepare' }
    | { readonly type: 'frameRecorded' };

/** Nome de um evento de Flow. */
export type FlowEventName = FlowEvent['type'];

/** O evento de nome `E`. */
export type FlowEventOf<E extends FlowEventName> = Extract<FlowEvent, { readonly type: E }>;

/**
 * Destino de uma transição: `'ignore'` (o evento é esperado e não muda nada) ou o próximo estado, com um passo
 * opcional `run` — onde o Flow recria recursos **privados** e os religa (`ctx.bind`), nunca no `dispatch`.
 */
export type FlowTransition<S extends string, C> =
    | 'ignore'
    | {
          readonly to: S;
          /** Passo da transição (sintaxe de método: o contexto é bivariante, como o `dispatch`). */
          run?(event: FlowEvent, ctx: C): void;
      };

/**
 * Tabela de transições de um Flow: `estado → evento → destino`. A chave `'*'` vale para qualquer estado (consultada
 * depois da do estado atual). Evento sem entrada é erro (`FlowTransitionError`).
 */
export type FlowTransitions<S extends string, C> = Readonly<
    Partial<Record<S | '*', Readonly<Partial<Record<FlowEventName, FlowTransition<S, C>>>>>>
>;

/** A tabela declara `event` em algum estado (ou em `'*'`)? */
export function tableHandles<S extends string, C>(
    table: FlowTransitions<S, C>,
    event: FlowEventName,
): boolean {
    return Object.values<Readonly<Partial<Record<FlowEventName, unknown>>> | undefined>(table).some(
        (row) => row?.[event] !== undefined,
    );
}

/** Evento sem transição a partir do estado atual. */
export class FlowTransitionError extends Error {
    override readonly name = 'FlowTransitionError';
    constructor(
        readonly flowType: string,
        readonly state: string,
        readonly event: FlowEventName,
    ) {
        super(
            `Flow '${flowType}': evento '${event}' sem transição a partir do estado '${state}' (declare-o na tabela, ou 'ignore').`,
        );
    }
}

/**
 * Aplica a tabela ao estado atual: devolve o próximo estado (o mesmo para `'ignore'`) e executa `run`.
 * @throws FlowTransitionError se não há entrada para o evento no estado nem em `'*'`.
 */
export function applyTransition<S extends string, C>(
    flowType: string,
    table: FlowTransitions<S, C>,
    state: S,
    event: FlowEvent,
    ctx: C,
): S {
    const transition = table[state]?.[event.type] ?? table['*']?.[event.type];
    if (transition === undefined) throw new FlowTransitionError(flowType, state, event.type);
    if (transition === 'ignore') return state;
    transition.run?.(event, ctx);
    return transition.to;
}
