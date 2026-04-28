import type { EventMap, EventName } from './EventMap';

export type EventHandler<E extends EventName> = (payload: EventMap[E]) => void;
export type Unsubscribe = () => void;

export interface EventBus {
    on<E extends EventName>(type: E, handler: EventHandler<E>): Unsubscribe;
    off<E extends EventName>(type: E, handler: EventHandler<E>): void;
    emit<E extends EventName>(type: E, payload: EventMap[E]): void;
}
