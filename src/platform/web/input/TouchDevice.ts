import type { Input } from '../../../presentation/input/Input';

/**
 * Touch input → reflexo no `Input.current`. Suporta:
 *   - 1 dedo: atualiza pointerX/Y (paridade com mouse).
 *   - 2 dedos: pinch — incrementa state.pinchDelta com a variação da distância
 *     entre os 2 dedos (positivo = afastando = zoom-out).
 */
export class TouchDevice {
    private lastPinchDist: number | null = null;

    constructor(
        private readonly canvas: HTMLCanvasElement,
        private readonly input: Input,
    ) {}

    /** Registra listeners de touch no canvas. */
    attach(): void {
        this.canvas.addEventListener('touchstart', this.onTouch, { passive: true });
        this.canvas.addEventListener('touchmove', this.onTouch, { passive: true });
        this.canvas.addEventListener('touchend', this.onEnd, { passive: true });
        this.canvas.addEventListener('touchcancel', this.onEnd, { passive: true });
    }

    /** Remove listeners de touch. */
    detach(): void {
        this.canvas.removeEventListener('touchstart', this.onTouch);
        this.canvas.removeEventListener('touchmove', this.onTouch);
        this.canvas.removeEventListener('touchend', this.onEnd);
        this.canvas.removeEventListener('touchcancel', this.onEnd);
    }

    private readonly onTouch = (e: TouchEvent): void => {
        const t0 = e.touches[0];
        if (t0 !== undefined) {
            this.input.current.pointerX = t0.clientX;
            this.input.current.pointerY = t0.clientY;
        }
        if (e.touches.length >= 2) {
            const a = e.touches[0]!;
            const b = e.touches[1]!;
            const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
            if (this.lastPinchDist !== null) {
                this.input.current.pinchDelta += dist - this.lastPinchDist;
            }
            this.lastPinchDist = dist;
        } else {
            this.lastPinchDist = null;
        }
    };

    private readonly onEnd = (): void => {
        this.lastPinchDist = null;
    };
}
