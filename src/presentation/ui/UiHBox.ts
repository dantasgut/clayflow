import { UiElement } from './UiElement';

/**
 * Container que arruma filhos lado-a-lado horizontalmente, com `gap` entre eles
 * e `padding` interno. O layout é aplicado em `UiHBox.layout()` que computa os
 * `bounds` de cada filho a partir de `bounds` próprio. Filhos com `width=0`
 * recebem largura distribuída (flex). Filhos com width>0 são `fixed`.
 */
export class UiHBox extends UiElement {
    /** Espaço (px) entre filhos consecutivos. Default: 4. */
    gap = 4;
    /** Padding interno (px) em todos os lados. Default: 0. */
    padding = 0;

    /** Recalcula bounds dos filhos (fixed-width preservado, flex divide o resto). */
    layout(): void {
        const innerW = Math.max(0, this.bounds.width - this.padding * 2);
        const innerH = Math.max(0, this.bounds.height - this.padding * 2);
        const visibleChildren = this.children.filter((c) => c.visible);
        if (visibleChildren.length === 0) return;
        const gaps = this.gap * Math.max(0, visibleChildren.length - 1);
        let fixedW = 0;
        let flexCount = 0;
        for (const c of visibleChildren) {
            if (c.bounds.width > 0) fixedW += c.bounds.width;
            else flexCount++;
        }
        const flexW = flexCount > 0 ? Math.max(0, (innerW - fixedW - gaps) / flexCount) : 0;
        let cursorX = this.bounds.x + this.padding;
        const y = this.bounds.y + this.padding;
        for (const c of visibleChildren) {
            const w = c.bounds.width > 0 ? c.bounds.width : flexW;
            const h = c.bounds.height > 0 ? c.bounds.height : innerH;
            c.bounds = { x: cursorX, y, width: w, height: h };
            if (c instanceof UiHBox) c.layout();
            cursorX += w + this.gap;
        }
    }
}
