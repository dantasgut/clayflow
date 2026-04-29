import type { Frame } from '../../core/contracts/index';
import { Flow } from '../../scene/flows/Flow';
import type { Phase } from '../../scene/flows/Flow';
import type { PipelineDescriptor } from '../../scene/descriptors/PipelineDescriptor';
import type { EventBus } from '../../scene/events/EventBus';

export interface ProfilerStatsEvent {
    /** Frames-per-second instantâneo (1/dt). */
    readonly fps: number;
    /** Frame time em ms (dt × 1000). */
    readonly frameTimeMs: number;
    /** Frame time médio (rolling window) em ms. */
    readonly avgFrameTimeMs: number;
    /** Tempos por stage (ns) opcionais — apenas se `timestamp-query` ativo. */
    readonly stagesNs: Readonly<Record<string, number>>;
}

export interface DebugFlowOptions {
    /** Emite `profilerStats` ao fim de cada frame quando enabled (default: true). */
    readonly emitStats?: boolean;
    /** Window de rolling average para frame time (default: 60). */
    readonly avgWindow?: number;
    /** Tecla que toggla o overlay (default: 'F1'). */
    readonly toggleKey?: string;
}

/**
 * DebugFlow — overlay opcional de FPS/frame time + emissão periódica de
 * `profilerStats`. Não desenha nada por padrão (flow lightweight); um
 * UIFlow/UiText pode subscrever ao evento e renderizar o texto.
 */
export class DebugFlow extends Flow {
    readonly type = 'DebugFlow';
    readonly bodyType = '';
    readonly phase: Phase = 'forward';
    override priority = -100;

    private enabled = false;
    private events: EventBus | null = null;
    private readonly emitStats: boolean;
    private readonly avgWindow: number;
    private readonly toggleKey: string;
    private readonly samples: number[] = [];
    private lastEmit = -Infinity;

    constructor(options: DebugFlowOptions = {}) {
        super();
        this.emitStats = options.emitStats ?? true;
        this.avgWindow = Math.max(1, options.avgWindow ?? 60);
        this.toggleKey = options.toggleKey ?? 'F1';
    }

    /** Anexa o flow a um EventBus para emitir profilerStats e ouvir tecla F1. */
    bindEvents(events: EventBus): this {
        this.events = events;
        events.on('frameTick', e => this.onFrameTick(e.dt, e.elapsed));
        if (typeof window !== 'undefined') {
            window.addEventListener('keydown', ev => {
                if (ev.code === this.toggleKey) this.enabled = !this.enabled;
            });
        }
        return this;
    }

    setEnabled(value: boolean): void { this.enabled = value; }
    isEnabled(): boolean { return this.enabled; }

    getPipelineDescriptors(): readonly PipelineDescriptor[] { return []; }

    override isReady(): boolean { return this.enabled; }

    private onFrameTick(dt: number, elapsed: number): void {
        const dtMs = dt * 1000;
        this.samples.push(dtMs);
        if (this.samples.length > this.avgWindow) this.samples.shift();
        if (!this.emitStats || !this.enabled || this.events === null) return;
        // throttle: emite no máximo 4× por segundo para reduzir noise no log.
        if (elapsed - this.lastEmit < 0.25) return;
        this.lastEmit = elapsed;
        let sum = 0;
        for (const s of this.samples) sum += s;
        const avg = sum / Math.max(1, this.samples.length);
        const stats: ProfilerStatsEvent = {
            fps: dt > 0 ? 1 / dt : 0,
            frameTimeMs: dtMs,
            avgFrameTimeMs: avg,
            stagesNs: {},
        };
        this.events.emit('profilerStats', stats);
    }

    dispatch(_frame: Frame): void {
        // Render gizmos/axes/HUD — fica como extension point. O overlay textual
        // de FPS é renderizado via UIFlow + UiText subscribindo `profilerStats`.
    }
}
