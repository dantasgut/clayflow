import type { Frame } from '../../scene/contracts/gpu';
import type { EventBus, Unsubscribe } from '../../scene/events/EventBus';
import { Flow } from '../../scene/flows/Flow';
import type { TransitionContext } from '../../scene/flows/FlowBinding';
import type { FlowContext } from '../../scene/flows/FlowRegistry';
import type { FlowTransitions } from '../../scene/flows/FlowTransitions';

export interface ProfilerStatsEvent {
    /** Frames-per-second instantâneo (1/dt). */
    readonly fps: number;
    /** Frame time em ms (dt × 1000). */
    readonly frameTimeMs: number;
    /** Frame time médio (rolling window) em ms. */
    readonly avgFrameTimeMs: number;
    /**
     * Tempo de GPU por rótulo de passe (ns), da última leitura resolvida
     * (`frameComplete.stats.stagesNs`). Vazio sem profiling por quadro ou sem `timestamp-query`.
     */
    readonly stagesNs: Readonly<Record<string, number>>;
}

/** Opções do `DebugFlow`. */
export interface DebugFlowOptions {
    /** Emite `profilerStats` ao fim de cada frame quando enabled (default: true). */
    readonly emitStats?: boolean;
    /** Window de rolling average para frame time (default: 60). */
    readonly avgWindow?: number;
    /** Tecla que toggla o overlay (default: 'F1'). */
    readonly toggleKey?: string;
}

/** Slots do `DebugFlow` (nenhum). */
export type DebugSlots = Readonly<Record<string, never>>;

const slots: DebugSlots = {};

/**
 * DebugFlow — overlay opcional de FPS/frame time + emissão periódica de
 * `profilerStats`. Não desenha nada por padrão (flow lightweight); um
 * UIFlow/UiText pode subscrever ao evento e renderizar o texto.
 *
 * Sem slots nem pipelines: observa `frameTick` (tempo do quadro) e `frameComplete` (tempos de GPU por passe) no
 * EventBus da cena desde a construção.
 */
export class DebugFlow extends Flow<DebugSlots, 'idle'> {
    readonly type = 'DebugFlow';
    readonly slots = slots;
    protected readonly initialState = 'idle' as const;
    protected readonly transitions: FlowTransitions<'idle', TransitionContext<DebugSlots>> = {
        '*': {
            slotsResolved: 'ignore',
            slotLost: 'ignore',
            pipelinesCompiled: 'ignore',
            bindGroupReplaced: 'ignore',
        },
    };

    private enabled = false;
    private events: EventBus | null = null;
    private readonly emitStats: boolean;
    private readonly avgWindow: number;
    private readonly toggleKey: string;
    private readonly samples: number[] = [];
    private lastEmit = -Infinity;
    private stagesNs: Readonly<Record<string, number>> = {};
    /** Inscrições no EventBus e o ouvinte de teclado — desfeitos em `dispose`. */
    private subscriptions: Unsubscribe[] = [];
    private keydownListener: ((ev: KeyboardEvent) => void) | null = null;

    constructor(ctx: Pick<FlowContext, 'events'>, options: DebugFlowOptions = {}) {
        super();
        this.emitStats = options.emitStats ?? true;
        this.avgWindow = Math.max(1, options.avgWindow ?? 60);
        this.toggleKey = options.toggleKey ?? 'F1';
        this.bindEvents(ctx.events);
    }

    /** Inscreve-se no EventBus para emitir profilerStats e ouvir a tecla de alternância. */
    private bindEvents(events: EventBus): void {
        this.events = events;
        this.subscriptions = [
            events.on('frameTick', (e) => {
                this.onFrameTick(e.dt, e.elapsed);
            }),
            events.on('frameComplete', (e) => {
                if (e.stats.stagesNs !== undefined) this.stagesNs = e.stats.stagesNs;
            }),
        ];
        if (typeof window !== 'undefined') {
            this.keydownListener = (ev: KeyboardEvent) => {
                if (ev.code === this.toggleKey) this.enabled = !this.enabled;
            };
            window.addEventListener('keydown', this.keydownListener);
        }
    }

    /** Descarte do estágio: remove as inscrições no EventBus e o ouvinte de teclado. */
    override dispose(): void {
        this.unbind();
        this.events = null;
    }

    private unbind(): void {
        for (const off of this.subscriptions) off();
        this.subscriptions = [];
        if (this.keydownListener !== null && typeof window !== 'undefined') {
            window.removeEventListener('keydown', this.keydownListener);
        }
        this.keydownListener = null;
    }

    /** Habilita/desabilita emissão de profilerStats event a cada frame. */
    setEnabled(value: boolean): void {
        this.enabled = value;
    }
    /** True se DebugFlow está coletando + emitindo stats. */
    isEnabled(): boolean {
        return this.enabled;
    }

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
            stagesNs: { ...this.stagesNs },
        };
        this.events.emit('profilerStats', stats);
    }

    dispatch(_frame: Frame): void {
        // Render gizmos/axes/HUD — fica como extension point. O overlay textual
        // de FPS é renderizado via UIFlow + UiText subscribindo `profilerStats`.
    }
}
