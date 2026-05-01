import type { UiTree } from '../UiTree';
import { UiPanel } from '../UiPanel';
import { UiButton } from '../UiButton';
import { UiSlider } from '../UiSlider';
import { UiText } from '../UiText';
import type { UiElement } from '../UiElement';
import type { UiTextLayout } from './UiTextLayout';
import type { UiQuadCpu } from './UiQuadCpu';

/**
 * Converte um `UiTree` em uma lista plana de `UiQuadCpu`, sem tocar GPU.
 * Estados visuais (Button hover/pressed, Slider handle posicionada por value)
 * resolvidos aqui em cor + bounds. Quads de texto delegados a `UiTextLayout`.
 */
export class UiFlattener {
    constructor(private textLayout: UiTextLayout | null = null) {}

    setTextLayout(layout: UiTextLayout | null): void {
        this.textLayout = layout;
    }

    flatten(tree: UiTree): UiQuadCpu[] {
        const out: UiQuadCpu[] = [];
        for (const c of tree.root.children) this.walk(c, out);
        return out;
    }

    private walk(el: UiElement, out: UiQuadCpu[]): void {
        if (!el.visible) return;
        if (el instanceof UiPanel) {
            out.push({
                rect: [el.bounds.x, el.bounds.y, el.bounds.width, el.bounds.height],
                color: [...el.background] as [number, number, number, number],
                uv: [0, 0, 0, 0],
                textured: 0,
            });
        } else if (el instanceof UiButton) {
            const c: [number, number, number, number] = el.pressed
                ? [0.15, 0.15, 0.2, 0.95]
                : el.hovered
                  ? [0.4, 0.4, 0.5, 0.9]
                  : [0.25, 0.25, 0.3, 0.85];
            out.push({
                rect: [el.bounds.x, el.bounds.y, el.bounds.width, el.bounds.height],
                color: c,
                uv: [0, 0, 0, 0],
                textured: 0,
            });
        } else if (el instanceof UiSlider) {
            out.push({
                rect: [el.bounds.x, el.bounds.y, el.bounds.width, el.bounds.height],
                color: [0.2, 0.2, 0.25, 0.85],
                uv: [0, 0, 0, 0],
                textured: 0,
            });
            const t = (el.value - el.min) / Math.max(el.max - el.min, 1e-6);
            const handleW = 8;
            out.push({
                rect: [
                    el.bounds.x + t * (el.bounds.width - handleW),
                    el.bounds.y,
                    handleW,
                    el.bounds.height,
                ],
                color: [0.85, 0.85, 0.95, 1],
                uv: [0, 0, 0, 0],
                textured: 0,
            });
        } else if (el instanceof UiText) {
            this.textLayout?.layout(el, out);
        }
        for (const c of el.children) this.walk(c, out);
    }
}
