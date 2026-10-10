import type { EventBus } from '../../scene/events/EventBus';
import type { Time } from '../../scene/time/Time';

function now(): number {
    return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

/**
 * Laço de quadros sobre `requestAnimationFrame`. Cada quadro mede o tempo real decorrido e chama `advance`, a
 * única definição de "avançar um quadro" — a mesma que `Application.step()` usa sem laço: `time.advance(realDt)`
 * e, em seguida, `frameTick { dt, realDt, elapsed, frame }`. Não há teto de `dt` aqui: o `Time` limita o quadro a
 * `maxFrameDt` e a física a `maxStepsPerFrame`.
 *
 * Ritmo (research R18): um tick só avança quando `canAdvance()` permite (há espaço para mais um quadro na GPU);
 * senão espera o próximo RAF sem mover a marca de tempo — o `realDt` seguinte inclui a espera e o acumulador do
 * `Time` compensa até o teto.
 */
export class GameLoop {
    private rafId: number | null = null;
    private last = 0;

    constructor(
        private readonly events: EventBus,
        private readonly time: Time,
        private readonly canAdvance: () => boolean = () => true,
    ) {}

    /** Avança um quadro de duração real `realDt` (s): move o relógio e emite `frameTick` (síncrono). */
    advance(realDt: number): void {
        const time = this.time;
        time.advance(realDt);
        this.events.emit('frameTick', {
            dt: time.dt,
            realDt: time.realDt,
            elapsed: time.elapsed,
            frame: time.frame,
        });
    }

    /** Inicia o laço (RAF). No-op se já rodando. */
    start(): void {
        if (this.rafId !== null) return;
        this.last = now();
        const tick = (): void => {
            if (!this.canAdvance()) {
                // GPU ainda ocupada com os quadros anteriores: não acumula mais um.
                this.rafId = requestAnimationFrame(tick);
                return;
            }
            const t = now();
            const realDt = Math.max(0, (t - this.last) / 1000);
            this.last = t;
            this.advance(realDt);
            // `stop()` chamado por um ouvinte do quadro encerra o laço.
            if (this.rafId !== null) this.rafId = requestAnimationFrame(tick);
        };
        this.rafId = requestAnimationFrame(tick);
    }

    /** Cancela o RAF agendado. No-op se não rodando. */
    stop(): void {
        if (this.rafId === null) return;
        cancelAnimationFrame(this.rafId);
        this.rafId = null;
    }

    /** True se o laço está ativo (RAF agendado). */
    isRunning(): boolean {
        return this.rafId !== null;
    }
}
