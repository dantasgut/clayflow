import type { Frame } from '../../core/contracts/index';
import type { PipelineDescriptor } from '../descriptors/PipelineDescriptor';
import type { Schema } from '../descriptors/Schema';
import type { BindingSources, BoundFlow, TransitionContext } from './FlowBinding';
import {
    applyTransition,
    tableHandles,
    type FlowEvent,
    type FlowEventName,
    type FlowTransitions,
} from './FlowTransitions';
import type { SlotMap } from './slots';

/**
 * Ciclo de vida de um Flow, gerido pela Camada 2:
 * `pending` (slot obrigatório ausente) → `preparing` (pipelines compilando) → `ready` (executa no quadro) →
 * `disposed` (removido). Volta a `pending` se um slot obrigatório some.
 */
export type FlowLifecycle = 'pending' | 'preparing' | 'ready' | 'disposed';

/**
 * Família de schemas que um Flow escuta como um só: os registros tipados de todas as formas de um ponto de extensão
 * (spec 031, R8 — o próprio `WgslPoint`), gerados quando as funções entram na cena.
 */
export interface SchemaFamily {
    /** `schema` pertence à família? */
    isRecord(schema: Schema): boolean;
}

/** O que um Flow escuta: um schema, ou uma família de schemas. */
export type Listened = Schema | SchemaFamily;

/** Acesso da C2 aos membros protegidos de um Flow (definido no bloco estático da classe). */
interface FlowAccess {
    deliver(flow: Flow, event: FlowEvent, ctx: TransitionContext): void;
    setLifecycle(flow: Flow, lifecycle: FlowLifecycle): void;
    handles(flow: Flow, event: FlowEventName): boolean;
}

let access: FlowAccess | undefined;

/**
 * Unidade de trabalho do quadro (um estágio): declara o que consome (`slots`, `pipelines` cujos shaders requerem
 * recursos declarados, fontes privadas por recurso) e grava comandos em `dispatch`. A Camada 2 resolve os slots, infere layouts do WGSL, cria
 * pipelines e bind groups, mantém tudo atualizado e entrega o resultado (`BoundFlow`) a cada quadro. O Flow nunca
 * cria layout nem bind group de dado consumido.
 *
 * - **Estado**: `S` é o estado próprio do algoritmo; muda só pela tabela `transitions` em reação a eventos da C2
 *   (`FlowEvent`). Não há método público de avanço de estado. O `run` de uma transição é onde recursos privados são
 *   criados ou recriados e religados (`ctx.bind`).
 * - **Gravação**: `dispatch(frame, bound)` só grava passes; não prepara pipelines, layouts nem bind groups.
 * - **Registro**: por factory, com fase, tipo de corpo e prioridade (`FlowRegistry.register`).
 *
 * @typeParam TSlots Declarações de slots (`slot.*`).
 * @typeParam S Estados próprios do Flow.
 */
export abstract class Flow<TSlots extends SlotMap = SlotMap, S extends string = string> {
    static {
        access = {
            deliver(flow, event, ctx) {
                flow.#state = applyTransition(flow.type, flow.transitions, flow.state, event, ctx);
            },
            setLifecycle(flow, lifecycle) {
                flow.#lifecycle = lifecycle;
            },
            handles(flow, event) {
                return tableHandles(flow.transitions, event);
            },
        };
    }

    /** Nome explícito do estágio (mensagens, profiling, `flowReady`) — dado, não nome de classe (minificação). */
    abstract readonly type: string;
    /** Slots consumidos, por nome. */
    abstract readonly slots: TSlots;
    /** Pipelines declarados; a C2 os prepara antes de o Flow ficar pronto. */
    readonly pipelines: readonly PipelineDescriptor[] = [];
    /** Bindings privados iniciais por recurso declarado (uniforms por passo, temporários do algoritmo). */
    readonly bindings: BindingSources = new Map();
    /**
     * Schemas (ou famílias de schemas: os registros de um ponto de extensão) cujos `resourceReady` e `poolWritten` o
     * Flow recebe como evento.
     */
    readonly listens: readonly Listened[] = [];
    /** Estado inicial do algoritmo. */
    protected abstract readonly initialState: S;
    /** Tabela de transições (estado × evento). */
    protected abstract readonly transitions: FlowTransitions<S, TransitionContext<TSlots>>;

    #state: S | undefined;
    #lifecycle: FlowLifecycle = 'pending';

    /** Estado do ciclo de vida (só a C2 o muda). */
    get lifecycle(): FlowLifecycle {
        return this.#lifecycle;
    }

    /** Estado próprio do algoritmo (só transições o mudam). */
    get state(): S {
        return this.#state ?? this.initialState;
    }

    /** Grava os comandos do quadro. Chamado só quando `lifecycle === 'ready'`. */
    abstract dispatch(frame: Frame, bound: BoundFlow<TSlots>): void;

    /** Libera os recursos privados do Flow. Chamado pela C2 no descarte (`unregister`). */
    dispose(): void {
        // Default: sem recursos privados.
    }
}

/** Entrega um evento ao Flow pela sua tabela de transições (C2). */
export function deliverFlowEvent(flow: Flow, event: FlowEvent, ctx: TransitionContext): void {
    access!.deliver(flow, event, ctx);
}

/** Muda o ciclo de vida do Flow (C2). */
export function setFlowLifecycle(flow: Flow, lifecycle: FlowLifecycle): void {
    access!.setLifecycle(flow, lifecycle);
}

/** A tabela do Flow declara o evento (eventos entregues só a quem os declara, como `frameRecorded`). */
export function flowHandles(flow: Flow, event: FlowEventName): boolean {
    return access!.handles(flow, event);
}
