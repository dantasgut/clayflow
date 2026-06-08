import type { Input } from './Input';

/**
 * Device de mouse/touch unificado (Pointer Events API). Popula
 * `Input.state.pointerX/Y/Buttons/DeltaX/DeltaY/wheel`. Use deltas para
 * camera orbit; absolute coords para UI hit-testing.
 */
export class PointerDevice {
    constructor(
        private readonly canvas: HTMLCanvasElement,
        private readonly input: Input,
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
        this.input.state.pointerButtons |= 1 << e.button;
    };
    private readonly onUp = (e: PointerEvent): void => {
        this.input.state.pointerButtons &= ~(1 << e.button);
    };
    private readonly onMove = (e: PointerEvent): void => {
        this.input.state.pointerDeltaX += e.movementX || e.clientX - this.input.state.pointerX;
        this.input.state.pointerDeltaY += e.movementY || e.clientY - this.input.state.pointerY;
        this.input.state.pointerX = e.clientX;
        this.input.state.pointerY = e.clientY;
    };
    private readonly onWheel = (e: WheelEvent): void => {
        this.input.state.wheel += e.deltaY;
    };
}
