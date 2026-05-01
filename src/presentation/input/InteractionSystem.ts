import type { EventBus } from '../../scene/events/EventBus';
import { Input } from './Input';
import { KeyboardDevice } from './KeyboardDevice';
import { PointerDevice } from './PointerDevice';
import { TouchDevice } from './TouchDevice';
import { GamepadDevice } from './GamepadDevice';
import type { InputDrivenController, ControllerContext } from './InputDrivenController';

export interface InteractionSystemOptions {
    readonly canvas: HTMLCanvasElement;
    readonly window: Window | null;
}

export class InteractionSystem {
    readonly input: Input;
    readonly keyboard: KeyboardDevice;
    readonly pointer: PointerDevice;
    readonly touch: TouchDevice;
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

    attach(): void {
        this.keyboard.attach();
        this.pointer.attach();
        this.touch.attach();
    }

    detach(): void {
        this.keyboard.detach();
        this.pointer.detach();
        this.touch.detach();
    }

    addController(controller: InputDrivenController): void {
        this.controllers.push(controller);
    }

    private tick(dt: number): void {
        const ctx: ControllerContext = { input: this.input, dt };
        for (const c of this.controllers) c.update(ctx);
        this.input.consumeFrameDeltas();
    }
}
