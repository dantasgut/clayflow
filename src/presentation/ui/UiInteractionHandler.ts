import type { UiElement, UiBounds } from './UiElement';
import { UiButton } from './UiButton';
import { UiSlider } from './UiSlider';
import type { UiTree } from './UiTree';

/**
 * Acopla pointer events de um canvas a um UiTree, suportando hover, click, e
 * drag em UiSlider. Hit-test percorre a árvore de fora-pra-dentro respeitando
 * `visible` e usa coordenadas do canvas (CSS px → coordenadas absolutas com
 * devicePixelRatio aplicado, casando com `bounds` em UiElement).
 *
 * Uso: `const h = new UiInteractionHandler(tree, canvas); h.attach();`
 * Detach via `h.detach()`. Idempotente para attach/detach repetidos.
 */
export class UiInteractionHandler {
    private attached = false;
    private hoveredButton: UiButton | null = null;
    private pressedButton: UiButton | null = null;
    private dragSlider: UiSlider | null = null;

    constructor(
        private readonly tree: UiTree,
        private readonly canvas: HTMLCanvasElement,
    ) {}

    /** Liga listeners de pointer ao canvas. Idempotente. */
    attach(): void {
        if (this.attached) return;
        this.canvas.addEventListener('pointerdown', this.onDown);
        this.canvas.addEventListener('pointerup', this.onUp);
        this.canvas.addEventListener('pointermove', this.onMove);
        this.canvas.addEventListener('pointerleave', this.onLeave);
        this.attached = true;
    }

    /** Remove listeners e limpa estado de hover/press/drag. Idempotente. */
    detach(): void {
        if (!this.attached) return;
        this.canvas.removeEventListener('pointerdown', this.onDown);
        this.canvas.removeEventListener('pointerup', this.onUp);
        this.canvas.removeEventListener('pointermove', this.onMove);
        this.canvas.removeEventListener('pointerleave', this.onLeave);
        this.attached = false;
        this.clearHover();
        this.pressedButton = null;
        this.dragSlider = null;
    }

    private localCoords(e: PointerEvent): { x: number; y: number } {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / Math.max(rect.width, 1);
        const scaleY = this.canvas.height / Math.max(rect.height, 1);
        return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
    }

    private hitTest(x: number, y: number): UiElement | null {
        // Walk back-to-front so children declared later win (typical UI layering).
        let hit: UiElement | null = null;
        const walk = (el: UiElement): void => {
            if (!el.visible) return;
            if (UiInteractionHandler.contains(el.bounds, x, y)) hit = el;
            for (const c of el.children) walk(c);
        };
        for (const c of this.tree.root.children) walk(c);
        return hit;
    }

    private static contains(b: UiBounds, x: number, y: number): boolean {
        return x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height;
    }

    private clearHover(): void {
        if (this.hoveredButton !== null) this.hoveredButton.hovered = false;
        this.hoveredButton = null;
    }

    private updateSliderFromPointer(slider: UiSlider, x: number): void {
        const t = Math.max(
            0,
            Math.min(1, (x - slider.bounds.x) / Math.max(slider.bounds.width, 1)),
        );
        const next = slider.min + t * (slider.max - slider.min);
        if (next !== slider.value) {
            slider.value = next;
            slider.onChange?.(next);
        }
    }

    private readonly onDown = (e: PointerEvent): void => {
        const p = this.localCoords(e);
        const target = this.hitTest(p.x, p.y);
        if (target instanceof UiButton) {
            this.pressedButton = target;
            target.pressed = true;
        } else if (target instanceof UiSlider) {
            this.dragSlider = target;
            this.updateSliderFromPointer(target, p.x);
        }
    };

    private readonly onUp = (e: PointerEvent): void => {
        const p = this.localCoords(e);
        const target = this.hitTest(p.x, p.y);
        if (this.pressedButton !== null) {
            const fired = this.pressedButton;
            fired.pressed = false;
            if (target === fired) fired.onClick?.();
            this.pressedButton = null;
        }
        if (this.dragSlider !== null) {
            this.updateSliderFromPointer(this.dragSlider, p.x);
            this.dragSlider = null;
        }
    };

    private readonly onMove = (e: PointerEvent): void => {
        const p = this.localCoords(e);
        if (this.dragSlider !== null) {
            this.updateSliderFromPointer(this.dragSlider, p.x);
            return;
        }
        const target = this.hitTest(p.x, p.y);
        const nextHover = target instanceof UiButton ? target : null;
        if (nextHover !== this.hoveredButton) {
            this.clearHover();
            if (nextHover !== null) {
                nextHover.hovered = true;
                this.hoveredButton = nextHover;
            }
        }
    };

    private readonly onLeave = (): void => {
        this.clearHover();
        if (this.pressedButton !== null) this.pressedButton.pressed = false;
        this.pressedButton = null;
        // Drag continues outside canvas only if pointer captured; for simplicity we cancel.
        this.dragSlider = null;
    };
}
