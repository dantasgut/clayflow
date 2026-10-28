import type { EventBus } from '../../../scene/events/EventBus';
import type { Input } from '../../../presentation/input/Input';

/**
 * Device de mouse/touch unificado (Pointer Events API). Popula `Input.current.pointerX/Y/Buttons/DeltaX/DeltaY/wheel`
 * (deltas para a órbita da câmera; coordenadas absolutas para UI) e emite `pointerDown`/`pointerUp`/`pointerMove`/
 * `wheel` no barramento, quando dado.
 */
export class PointerDevice {
    constructor(
        private readonly canvas: HTMLCanvasElement,
        private readonly input: Input,
        private readonly events?: EventBus,
    ) {}

    /** Registra listeners no canvas. */
    attach(): void {
        this.canvas.addEventListener('pointerdown', this.onDown);
        this.canvas.addEventListener('pointerup', this.onUp);
        this.canvas.addEventListener('pointermove', this.onMove);
        this.canvas.addEventListener('wheel', this.onWheel, { passive: true });
    }

    /** Remove listeners. */
    detach(): void {
        this.canvas.removeEventListener('pointerdown', this.onDown);
        this.canvas.removeEventListener('pointerup', this.onUp);
        this.canvas.removeEventListener('pointermove', this.onMove);
        this.canvas.removeEventListener('wheel', this.onWheel);
    }

    private readonly onDown = (e: PointerEvent): void => {
        this.input.current.pointerButtons |= 1 << e.button;
        this.events?.emit('pointerDown', this.pointerEvent(e, 0, 0));
    };
    private readonly onUp = (e: PointerEvent): void => {
        this.input.current.pointerButtons &= ~(1 << e.button);
        this.events?.emit('pointerUp', this.pointerEvent(e, 0, 0));
    };
    private readonly onMove = (e: PointerEvent): void => {
        const dx = e.movementX || e.clientX - this.input.current.pointerX;
        const dy = e.movementY || e.clientY - this.input.current.pointerY;
        this.input.current.pointerDeltaX += dx;
        this.input.current.pointerDeltaY += dy;
        this.input.current.pointerX = e.clientX;
        this.input.current.pointerY = e.clientY;
        this.events?.emit('pointerMove', this.pointerEvent(e, dx, dy));
    };
    private readonly onWheel = (e: WheelEvent): void => {
        this.input.current.wheel += e.deltaY;
        this.events?.emit('wheel', { delta: e.deltaY });
    };

    private pointerEvent(e: PointerEvent, dx: number, dy: number) {
        return { x: e.clientX, y: e.clientY, dx, dy, button: e.button };
    }
}
