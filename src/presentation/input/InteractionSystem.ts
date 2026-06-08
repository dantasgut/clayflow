import type { EventBus } from '../../scene/events/EventBus';
import { Input } from './Input';
import { KeyboardDevice } from './KeyboardDevice';
import { PointerDevice } from './PointerDevice';
import { TouchDevice } from './TouchDevice';
import { GamepadDevice } from './GamepadDevice';
import type { InputDrivenController, ControllerContext } from './InputDrivenController';

/**
 * Configuração do InteractionSystem. `window` permite injeção em tests
 * (jsdom) ou para múltiplos canvases compartilharem o mesmo Window.
 */
export interface InteractionSystemOptions {
    /** Canvas onde pointer/touch events são capturados. */
    readonly canvas: HTMLCanvasElement;
    /** Window onde keyboard events são capturados. Null = fallback para canvas. */
    readonly window: Window | null;
}

/**
 * InteractionSystem encapsula todos os input devices (keyboard, pointer,
 * touch, gamepad) num Input shared state. Tick por frame propaga state
 * para controllers registrados (FlyController, OrbitController, etc.).
 *
 * Lifecycle:
 *   1. `new InteractionSystem({canvas, window}, events)`.
 *   2. `attach()` — registra DOM listeners (keydown, pointermove, etc.).
 *   3. `addController(c)` — controllers reagem ao input em cada tick.
 *   4. `detach()` — limpa listeners (chamado pelo plugin dispose).
 */
export class InteractionSystem {
    /** Input state shared entre devices e controllers. */
    readonly input: Input;
    /** KeyboardDevice — captura keydown/keyup no `window`. */
    readonly keyboard: KeyboardDevice;
    /** PointerDevice — captura pointer events no canvas (mouse, pen). */
    readonly pointer: PointerDevice;
    /** TouchDevice — captura touch events (multi-touch + pinch). */
    readonly touch: TouchDevice;
    /** GamepadDevice — polling-based (Gamepad API não dispatch events). */
    readonly gamepad: GamepadDevice;
    private readonly controllers: InputDrivenController[] = [];

    constructor(
        private readonly options: InteractionSystemOptions,
        private readonly events: EventBus,
    ) {
        this.input = new Input();
        const w = options.window ?? (typeof window !== 'undefined' ? window : null);
        this.keyboard = new KeyboardDevice(w ?? options.canvas, this.input);
        this.pointer = new PointerDevice(options.canvas, this.input);
        this.touch = new TouchDevice(options.canvas, this.input);
        this.gamepad = new GamepadDevice();
        this.events.on('frameTick', (e) => {
            this.tick(e.dt);
        });
    }

    /** Registra DOM event listeners. Chamar uma vez após construção. */
    attach(): void {
        this.keyboard.attach();
        this.pointer.attach();
        this.touch.attach();
    }

    /** Remove DOM listeners. Chamar antes de descartar o InteractionSystem. */
    detach(): void {
        this.keyboard.detach();
        this.pointer.detach();
        this.touch.detach();
    }

    /**
     * Adiciona um controller que será atualizado a cada frameTick. Common
     * controllers: OrbitController, FpsController, FlyController.
     */
    addController(controller: InputDrivenController): void {
        this.controllers.push(controller);
    }

    private tick(dt: number): void {
        const ctx: ControllerContext = { input: this.input, dt };
        for (const c of this.controllers) c.update(ctx);
        this.input.consumeFrameDeltas();
    }
}
