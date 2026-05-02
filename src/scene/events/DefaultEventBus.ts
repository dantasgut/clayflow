import type { EventBus, EventHandler, Unsubscribe } from './EventBus';
import type { EventMap, EventName } from './EventMap';

/**
 * Implementação default do EventBus — Set por tipo de evento, dispatch
 * sincrônico em ordem de registro. Iteração via cópia para permitir
 * unsubscribe durante o emit (o handler que se desregistra ainda recebe
 * o evento atual).
 */
export class DefaultEventBus implements EventBus {
    private readonly handlers = new Map<EventName, Set<EventHandler<EventName>>>();

    /** Registra handler. Retorna função de unsubscribe. */
    on<E extends EventName>(type: E, handler: EventHandler<E>): Unsubscribe {
        let set = this.handlers.get(type);
        if (set === undefined) {
            set = new Set();
            this.handlers.set(type, set);
        }
        set.add(handler as EventHandler<EventName>);
        return () => {
            this.off(type, handler);
        };
    }

    /** Remove handler. No-op se não registrado. */
    off<E extends EventName>(type: E, handler: EventHandler<E>): void {
        this.handlers.get(type)?.delete(handler as EventHandler<EventName>);
    }

    /** Dispatch sincrônico. Cópia da Set permite unsubscribe durante iteração. */
    emit<E extends EventName>(type: E, payload: EventMap[E]): void {
        const set = this.handlers.get(type);
        if (set === undefined) return;
        for (const handler of [...set]) {
            (handler as EventHandler<E>)(payload);
        }
    }
}
