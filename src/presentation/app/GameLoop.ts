import type { EventBus, Unsubscribe } from '../../scene/events/EventBus';
import type { Time } from '../../scene/time/Time';
import type { FrameScheduler } from './FrameScheduler';

function now(): number {
    return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

/**
 * Laço de quadros sobre o agendador do ambiente (`FrameScheduler`, spec 038: o `requestAnimationFrame` no navegador,
 * o laço do Deno). Cada quadro mede o tempo real decorrido e chama `advance`, a
 * única definição de "avançar um quadro" — a mesma que `Application.step()` usa sem laço: `time.advance(realDt)`
 * e, em seguida, `frameTick { dt, realDt, elapsed, frame }`. Não há teto de `dt` aqui: o `Time` limita o quadro a
 * `maxFrameDt` e a física a `maxStepsPerFrame`.
 *
 * Ritmo (research R18): um tick só avança quando `canAdvance()` permite (há espaço para mais um quadro na GPU).
 * Sem espaço, o laço não pede outro RAF: espera o evento `frameRetired` (um quadro terminou na GPU) e só então pede
 * o RAF seguinte. Um RAF que não desenha faz o navegador espaçar o próximo (sem vsync, ~1/60 s), então esperar
 * pelo evento é o que mantém o ritmo da GPU. A marca de tempo não se move na espera — o `realDt` seguinte a inclui
 * e o acumulador do `Time` compensa até o teto.
 */
export class GameLoop {
    private rafId: unknown = null;
    private last = 0;
    private running = false;
    /** Tick recusado por falta de espaço na GPU; o próximo RAF sai no `frameRetired`. */
    private waitingForGpu = false;
    private unsubscribeRetired: Unsubscribe | null = null;

    constructor(
        private readonly events: EventBus,
        private readonly time: Time,
        private readonly canAdvance: () => boolean = () => true,
        /** O agendador do próximo quadro (spec 038: do ponto de entrada do ambiente). */
        private readonly scheduler?: FrameScheduler,
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
        if (this.running) return;
        this.running = true;
        this.waitingForGpu = false;
        this.last = now();
        this.unsubscribeRetired = this.events.on('frameRetired', () => {
            if (!this.running || !this.waitingForGpu || !this.canAdvance()) return;
            this.waitingForGpu = false;
            this.schedule();
        });
        this.schedule();
    }

    /** Cancela o RAF agendado e a espera pela GPU. No-op se não rodando. */
    stop(): void {
        if (!this.running) return;
        this.running = false;
        this.waitingForGpu = false;
        this.unsubscribeRetired?.();
        this.unsubscribeRetired = null;
        if (this.rafId !== null) this.scheduler?.cancel(this.rafId);
        this.rafId = null;
    }

    /** True se o laço está ativo (RAF agendado ou esperando espaço na GPU). */
    isRunning(): boolean {
        return this.running;
    }

    private schedule(): void {
        if (this.scheduler === undefined) {
            throw new Error(
                'GameLoop: sem agendador de quadros — o laço vem do ponto de entrada do ambiente (`clayflow/web`, `clayflow/deno`); sem ele, avance por `step()`.',
            );
        }
        this.rafId = this.scheduler.request(this.tick);
    }

    private readonly tick = (): void => {
        this.rafId = null;
        if (!this.running) return;
        if (!this.canAdvance()) {
            // GPU ainda ocupada com os quadros anteriores: não acumula mais um nem gasta RAF sem desenhar.
            this.waitingForGpu = true;
            return;
        }
        const t = now();
        const realDt = Math.max(0, (t - this.last) / 1000);
        this.last = t;
        this.advance(realDt);
        // `stop()` chamado por um ouvinte do quadro encerra o laço.
        if (this.isRunning()) this.schedule();
    };
}
