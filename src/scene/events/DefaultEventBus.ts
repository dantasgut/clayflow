import type { EventBus, EventHandler, Unsubscribe } from './EventBus';
import type { EventMap, EventName } from './EventMap';

export class DefaultEventBus implements EventBus {
    private readonly handlers = new Map<EventName, Set<EventHandler<EventName>>>();

    on<E extends EventName>(type: E, handler: EventHandler<E>): Unsubscribe {
        let set = this.handlers.get(type);
        if (set === undefined) {
            set = new Set();
            this.handlers.set(type, set);
        }
        set.add(handler as EventHandler<EventName>);
        return () => this.off(type, handler);
    }

    off<E extends EventName>(type: E, handler: EventHandler<E>): void {
        this.handlers.get(type)?.delete(handler as EventHandler<EventName>);
    }

    emit<E extends EventName>(type: E, payload: EventMap[E]): void {
        const set = this.handlers.get(type);
        if (set === undefined) return;
        for (const handler of [...set]) {
            (handler as EventHandler<E>)(payload);
        }
    }
}
