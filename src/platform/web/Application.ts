import {
    Engine,
    type EngineCommonOptions,
    type EngineOptions,
    type PreparedEngine,
} from '../../presentation/app/Engine';
import type { InputDevicesFactory } from '../../presentation/app/sceneInteraction';
import { animationFrameScheduler } from './AnimationFrameScheduler';
import { GamepadDevice } from './input/GamepadDevice';
import { KeyboardDevice } from './input/KeyboardDevice';
import { PointerDevice } from './input/PointerDevice';
import { TouchDevice } from './input/TouchDevice';
import { WebPlatformAdapter } from './WebPlatformAdapter';

/**
 * Opções do `Application` do navegador (spec 038, `clayflow/web`): as do motor mais o canvas e o redimensionamento.
 * Apenas `canvas` é obrigatório.
 */
export interface ApplicationOptions extends EngineCommonOptions {
    /** HTMLCanvasElement onde a engine renderiza. Deve estar attachado ao DOM. */
    canvas: HTMLCanvasElement;
    /** Tamanho do canvas pelo tamanho exibido × DPR, acompanhado no redimensionamento (default true no navegador). */
    autoResize?: boolean;
    /** Debounce em ms para o handler de resize (default 100). */
    resizeDebounceMs?: number;
}

/** Os dispositivos do DOM: o teclado no `window` (ou no canvas sem ele), o ponteiro e o toque no canvas, os gamepads. */
function domInputDevices(canvas: HTMLCanvasElement): InputDevicesFactory {
    return (input, events) => {
        const target = typeof window !== 'undefined' ? window : canvas;
        return [
            new KeyboardDevice(target, input, events),
            new PointerDevice(canvas, input, events),
            new TouchDevice(canvas, input),
            new GamepadDevice(input),
        ];
    };
}

/**
 * Application — o motor no navegador sobre um `<canvas>` (spec 038, `clayflow/web`): o `Engine` com o adaptador de
 * plataforma do navegador (`navigator.gpu`, o contexto `webgpu` do canvas), o laço pelo `requestAnimationFrame` e a
 * entrada do DOM.
 *
 * Resize: por padrão (`autoResize: true` em browser) o tamanho do canvas segue o tamanho exibido × DPR — sincronizado
 * na criação e acompanhado por `ResizeObserver` no próprio canvas (o layout pode mudar sem a janela mudar; sem o
 * observador, `window.resize`), debounced 100ms — reconfigura o canvas + emite `canvasReconfigured`: a C2 recria as
 * texturas do tamanho do canvas e os Flows recriam os seus recursos privados dependentes do tamanho numa transição.
 */
export class Application extends Engine {
    /** Canvas HTML attachado. Mesmo objeto passado em `create({canvas})`. */
    readonly canvas: HTMLCanvasElement;
    private readonly resizeDebounceMs: number;
    private resizeTimer: ReturnType<typeof setTimeout> | null = null;
    private resizeListener: (() => void) | null = null;
    private resizeObserver: ResizeObserver | null = null;

    private constructor(
        options: ApplicationOptions,
        engine: EngineOptions,
        prepared: PreparedEngine,
    ) {
        super(engine, prepared);
        this.canvas = options.canvas;
        this.resizeDebounceMs = options.resizeDebounceMs ?? 100;
        const autoResize = options.autoResize ?? typeof window !== 'undefined';
        if (autoResize && typeof window !== 'undefined') {
            if (typeof ResizeObserver !== 'undefined') {
                this.resizeObserver = new ResizeObserver(() => {
                    this.scheduleResize();
                });
                this.resizeObserver.observe(this.canvas);
            } else {
                this.resizeListener = () => {
                    this.scheduleResize();
                };
                window.addEventListener('resize', this.resizeListener);
            }
            // Tamanho exibido desde o primeiro quadro (o canvas nasce com 300×150 até alguém o ajustar).
            this.handleResize();
        }
    }

    /**
     * Construtor async — inicializa GPU device + canvas, registra os Flows default e retorna a `Application` pronta
     * para `start()`. Se `options.scene` é fornecido usa contexto isolado (multi-Application); caso contrário usa o
     * singleton default.
     */
    static override async create(options: ApplicationOptions): Promise<Application> {
        const platform = new WebPlatformAdapter();
        const engine: EngineOptions = {
            ...options,
            platform,
            surface: platform.getContext(options.canvas),
            scheduler: animationFrameScheduler,
            inputDevices: domInputDevices(options.canvas),
        };
        return new Application(options, engine, await Engine.prepareFor(engine));
    }

    /**
     * Re-sincroniza canvas.width/height com clientWidth/clientHeight × DPR, reconfigura o swapchain do core e emite
     * `canvasReconfigured` para que Flows recriem suas textures size-dependent.
     */
    handleResize(): void {
        // Fora do layout (sem tamanho exibido): mantém o tamanho atual.
        if (this.canvas.clientWidth === 0 || this.canvas.clientHeight === 0) return;
        const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
        const newW = Math.max(1, Math.floor(this.canvas.clientWidth * dpr));
        const newH = Math.max(1, Math.floor(this.canvas.clientHeight * dpr));
        if (this.canvas.width === newW && this.canvas.height === newH) return;
        this.canvas.width = newW;
        this.canvas.height = newH;
        this.surfaceResized();
    }

    private scheduleResize(): void {
        if (this.resizeTimer !== null) clearTimeout(this.resizeTimer);
        this.resizeTimer = setTimeout(() => {
            this.resizeTimer = null;
            this.handleResize();
        }, this.resizeDebounceMs);
    }

    protected override disposeEnvironment(): void {
        if (this.resizeTimer !== null) {
            clearTimeout(this.resizeTimer);
            this.resizeTimer = null;
        }
        this.resizeObserver?.disconnect();
        this.resizeObserver = null;
        if (this.resizeListener !== null && typeof window !== 'undefined') {
            window.removeEventListener('resize', this.resizeListener);
            this.resizeListener = null;
        }
    }
}
