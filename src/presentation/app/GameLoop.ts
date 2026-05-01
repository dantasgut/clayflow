import type { EventBus } from '../../scene/events/EventBus';
import type { Time } from './Time';

export class GameLoop {
    private rafId: number | null = null;
    private last = 0;

    constructor(
        private readonly events: EventBus,
        private readonly time: Time,
    ) {}

    start(): void {
        if (this.rafId !== null) return;
        this.last = typeof performance !== 'undefined' ? performance.now() : Date.now();
        const tick = (): void => {
            const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
            const dt = Math.min((now - this.last) / 1000, 1 / 30);
            this.last = now;
            this.time.update(dt);
            this.events.emit('frameTick', { dt, elapsed: this.time.data.elapsed as number });
            this.rafId = requestAnimationFrame(tick);
        };
        this.rafId = requestAnimationFrame(tick);
    }

    stop(): void {
        if (this.rafId === null) return;
        cancelAnimationFrame(this.rafId);
        this.rafId = null;
    }

    isRunning(): boolean {
        return this.rafId !== null;
    }
}
