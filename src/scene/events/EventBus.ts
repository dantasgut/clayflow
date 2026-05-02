import type { EventMap, EventName } from './EventMap';

/**
 * Handler de evento — função que recebe o payload tipado pelo EventMap.
 * `E` é a chave do evento, `payload` é tipado como `EventMap[E]`.
 */
export type EventHandler<E extends EventName> = (payload: EventMap[E]) => void;

/** Função retornada por `on()` que remove o handler quando chamada. */
export type Unsubscribe = () => void;

/**
 * EventBus tipado — pub/sub com type safety em compile time. O `EventMap`
 * mapeia nomes de evento para tipos de payload; o EventBus só aceita
 * combinações válidas.
 *
 * Implementação default: `DefaultEventBus`.
 */
export interface EventBus {
    /** Registra handler. Retorna função para deregistrar (Unsubscribe pattern). */
    on<E extends EventName>(type: E, handler: EventHandler<E>): Unsubscribe;
    /** Remove handler manualmente (alternativa ao Unsubscribe retornado por on). */
    off<E extends EventName>(type: E, handler: EventHandler<E>): void;
    /** Dispatch sincrônico para todos os handlers registrados. */
    emit<E extends EventName>(type: E, payload: EventMap[E]): void;
}
