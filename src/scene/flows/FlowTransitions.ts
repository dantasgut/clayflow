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
 * - `pipelineRejected`: o compilador rejeitou o shader de um pipeline preparado com `verify` (código de fora); a
 *   cena já anunciou `extensionRejected`. O Flow continua com o pipeline anterior.
 * - `bindGroupReplaced`: a C2 recriou um bind group de um pipeline do Flow (fonte recriada).
 * - `entitiesChanged`: entraram ou saíram entidades de um slot `entities` — um evento por slot por quadro, com as
 *   mudanças acumuladas desde o anterior, entregue antes de `framePrepare`.
 * - `canvasReconfigured`: o canvas mudou de tamanho (Flows com slot `target`).
 * - `poolReallocated`: um pool de um slot do Flow foi recriado (crescimento).
 * - `resourceReady`: um Resource com objetos próprios, de um schema de `listens`, foi alocado ou enviado.
 * - `poolWritten`: a C2 enviou faixas de um pool cujo schema está em `listens` (um evento por pool por envio).
 * - `framePrepare`: o quadro vai ser gravado (dados enviados, slots e bind groups reconciliados) — momento das
 *   escritas por quadro de uniforms privados (parâmetros por passo, contagens). Entregue só a quem o declara.
 * - `frameRecorded`: o quadro em que o Flow gravou foi enviado — entregue só aos Flows cuja tabela declara o evento
 *   (ex.: um estágio reativo que volta a "limpo" depois de gravar o trabalho pendente).
 */
export type FlowEvent =
    | {
          /** Slots obrigatórios resolvidos. */
          readonly type: 'slotsResolved';
      }
    | {
          /** Slot obrigatório perdido. */
          readonly type: 'slotLost';
          /** Nome do slot que deixou de existir. */
          readonly slot: string;
      }
    | {
          /** Slot opcional mudou. */
          readonly type: 'slotChanged';
          /** Nome do slot que apareceu, sumiu ou trocou de recurso. */
          readonly slot: string;
      }
    | {
          /** Pipelines compilados. */
          readonly type: 'pipelinesCompiled';
          /** Id do pipeline preparado em transição que compilou; ausente para os declarados (Flow pronto). */
          readonly pipeline?: string;
      }
    | {
          /** Shader de um pipeline com `verify` rejeitado pelo compilador. */
          readonly type: 'pipelineRejected';
          /** Id do pipeline. */
          readonly pipeline: string;
      }
    | {
          /** Bind group recriado pela C2. */
          readonly type: 'bindGroupReplaced';
          /** Id do pipeline dono do grupo. */
          readonly pipeline: string;
          /** Índice do `@group`. */
          readonly group: number;
          /** Bind group anterior (já fora de uso a partir da próxima gravação). */
          readonly oldSpec: BindGroupSpec;
          /** Bind group novo. */
          readonly newSpec: BindGroupSpec;
      }
    | {
          /** Entidades entraram ou saíram de um slot `entities`. */
          readonly type: 'entitiesChanged';
          /** Nome do slot `entities`. */
          readonly slot: string;
          /** Entidades que passaram a casar com a consulta do slot. */
          readonly added: readonly EntityId[];
          /** Entidades que saíram do slot (removidas do World). */
          readonly removed: readonly EntityId[];
      }
    | {
          /** Canvas redimensionado. */
          readonly type: 'canvasReconfigured';
          /** Largura nova, em pixels. */
          readonly width: number;
          /** Altura nova, em pixels. */
          readonly height: number;
      }
    | {
          /** Pool de um slot recriado. */
          readonly type: 'poolReallocated';
          /** Chave do pool recriado. */
          readonly poolKey: string;
      }
    | {
          /** Resource de um schema de `listens` alocado ou enviado. */
          readonly type: 'resourceReady';
          /** Schema (de `listens`) do Resource. */
          readonly schema: Schema;
          /** O Resource alocado ou enviado. */
          readonly resource: Resource;
      }
    | {
          /** Faixas de um pool de um schema de `listens` enviadas pela CPU. */
          readonly type: 'poolWritten';
          /** Chave do pool. */
          readonly poolKey: string;
          /** Schema (de `listens`) do pool. */
          readonly schema: Schema;
          /** Faixas escritas: `[primeiro slot, quantidade]`. */
          readonly ranges: readonly (readonly [number, number])[];
      }
    | {
          /** Quadro prestes a ser gravado (opt-in). */
          readonly type: 'framePrepare';
      }
    | {
          /** Quadro enviado (opt-in). */
          readonly type: 'frameRecorded';
      };

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
          /** Próximo estado do algoritmo. */
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
    /** Nome do erro (`'FlowTransitionError'`). */
    override readonly name = 'FlowTransitionError';
    /**
     * @param flowType - `type` do Flow.
     * @param state - Estado do algoritmo quando o evento chegou.
     * @param event - Evento sem transição.
     */
    constructor(
        /** `type` do Flow. */
        readonly flowType: string,
        /** Estado do algoritmo quando o evento chegou. */
        readonly state: string,
        /** Evento sem transição. */
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
