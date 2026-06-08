import type { EventBus } from '../../scene/events/EventBus';
import type { Time } from './Time';

/**
 * GameLoop encapsula o requestAnimationFrame loop. Cada frame:
 *   1. Computa `dt` (tempo desde último frame, clamped em 1/30 para
 *      evitar saltos enormes após pause/blur).
 *   2. Atualiza `Time.data.elapsed`.
 *   3. Emite `frameTick` event no EventBus.
 *   4. Agenda próximo RAF.
 *
 * Application instancia + start/stop. ExecutionSystem ouve frameTick
 * para dispatch dos Flows.
 */
export class GameLoop {
    private rafId: number | null = null;
    private last = 0;

    constructor(
        private readonly events: EventBus,
        private readonly time: Time,
    ) {}

    /** Inicia o RAF loop. No-op se já rodando. */
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

    /** Cancela o RAF agendado. No-op se não rodando. */
    stop(): void {
        if (this.rafId === null) return;
        cancelAnimationFrame(this.rafId);
        this.rafId = null;
    }

    /** True se o loop está ativo (RAF agendado). */
    isRunning(): boolean {
        return this.rafId !== null;
    }
}
