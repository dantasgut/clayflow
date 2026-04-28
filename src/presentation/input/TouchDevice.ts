import type { Input } from './Input';

export class TouchDevice {
    constructor(private readonly canvas: HTMLCanvasElement, private readonly input: Input) {}

    attach(): void {
        this.canvas.addEventListener('touchstart', this.onTouch, { passive: true });
        this.canvas.addEventListener('touchmove', this.onTouch, { passive: true });
    }

    detach(): void {
        this.canvas.removeEventListener('touchstart', this.onTouch);
        this.canvas.removeEventListener('touchmove', this.onTouch);
    }

    private readonly onTouch = (e: TouchEvent): void => {
        const t = e.touches[0];
        if (t === undefined) return;
        this.input.state.pointerX = t.clientX;
        this.input.state.pointerY = t.clientY;
    };
}
