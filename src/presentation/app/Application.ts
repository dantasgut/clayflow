import {
    bootstrap,
    engine,
    events,
    flows,
    resourceSystem,
    world,
    consumers,
    layoutInferencer,
    executionSystem,
} from '../../scene/index';
import type { CanvasOptions, FlowRegistry, World } from '../../scene/index';
import { GameLoop } from './GameLoop';
import { Time } from './Time';
import {
    registerPresentationDefaults,
    type PresentationDefaults,
} from '../flows/defaults';

export interface ApplicationOptions {
    canvas: HTMLCanvasElement;
    canvasOptions?: CanvasOptions;
    /** Auto-attach window.resize listener (default true em ambiente browser). */
    autoResize?: boolean;
    /** Debounce em ms para o handler de resize (default 100). */
    resizeDebounceMs?: number;
}

export class Application {
    readonly world: World;
    readonly flows: FlowRegistry;
    readonly time: Time;
    readonly defaults: PresentationDefaults;
    readonly canvas: HTMLCanvasElement;
    private readonly loop: GameLoop;
    private readonly resizeDebounceMs: number;
    private resizeTimer: ReturnType<typeof setTimeout> | null = null;
    private resizeListener: (() => void) | null = null;

    private constructor(options: ApplicationOptions, defaults: PresentationDefaults) {
        this.canvas = options.canvas;
        this.world = world;
        this.flows = flows;
        this.time = new Time();
        this.defaults = defaults;
        this.loop = new GameLoop(events, this.time);
        this.resizeDebounceMs = options.resizeDebounceMs ?? 100;
        world.insert(this.time);

        const autoResize = options.autoResize ?? (typeof window !== 'undefined');
        if (autoResize && typeof window !== 'undefined') {
            this.resizeListener = () => this.scheduleResize();
            window.addEventListener('resize', this.resizeListener);
        }
    }

    static async create(options: ApplicationOptions): Promise<Application> {
        if (options.canvasOptions !== undefined) {
            await bootstrap({ canvas: options.canvas, canvasOptions: options.canvasOptions });
        } else {
            await bootstrap({ canvas: options.canvas });
        }
        const defaults = registerPresentationDefaults(flows, {
            canvas: options.canvas,
            core: engine,
            world,
            resources: resourceSystem,
            events,
        });
        return new Application(options, defaults);
    }

    start(): void {
        this.loop.start();
    }

    stop(): void {
        this.loop.stop();
    }

    isRunning(): boolean {
        return this.loop.isRunning();
    }

    /**
     * Re-sincroniza canvas.width/height com clientWidth/clientHeight × DPR,
     * reconfigura o swapchain do core, e emite `canvasReconfigured` para
     * que Flows recriem suas textures size-dependent.
     */
    handleResize(): void {
        const dpr = (typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1);
        const newW = Math.max(1, Math.floor(this.canvas.clientWidth * dpr));
        const newH = Math.max(1, Math.floor(this.canvas.clientHeight * dpr));
        if (this.canvas.width === newW && this.canvas.height === newH) return;
        this.canvas.width = newW;
        this.canvas.height = newH;
        engine.reconfigureCanvas();
        events.emit('canvasReconfigured', {
            width: newW, height: newH, format: engine.canvasFormat,
        });
    }

    private scheduleResize(): void {
        if (this.resizeTimer !== null) clearTimeout(this.resizeTimer);
        this.resizeTimer = setTimeout(() => {
            this.resizeTimer = null;
            this.handleResize();
        }, this.resizeDebounceMs);
    }

    dispose(): void {
        this.stop();
        if (this.resizeTimer !== null) {
            clearTimeout(this.resizeTimer);
            this.resizeTimer = null;
        }
        if (this.resizeListener !== null && typeof window !== 'undefined') {
            window.removeEventListener('resize', this.resizeListener);
            this.resizeListener = null;
        }
    }

    get core() { return engine; }
    get events() { return events; }
    get resources() { return resourceSystem; }
    get consumers() { return consumers; }
    get layoutInferencer() { return layoutInferencer; }
    get executionSystem() { return executionSystem; }
}
