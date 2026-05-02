import { UiElement } from './UiElement';

/**
 * Container vertical: filhos empilhados de cima para baixo. Mesma semântica de
 * `UiHBox` (gap, padding, fixed-or-flex height).
 */
export class UiVBox extends UiElement {
    /** Espaço (px) entre filhos consecutivos. Default: 4. */
    gap = 4;
    /** Padding interno (px) em todos os lados. Default: 0. */
    padding = 0;

    /**
     * Recalcula bounds dos filhos. Filhos com `height > 0` mantêm tamanho
     * fixo; os demais dividem o espaço restante igualmente (flex). Chamar
     * sempre que filhos forem adicionados/removidos ou bounds do container mudar.
     */
    layout(): void {
        const innerW = Math.max(0, this.bounds.width - this.padding * 2);
        const innerH = Math.max(0, this.bounds.height - this.padding * 2);
        const visibleChildren = this.children.filter((c) => c.visible);
        if (visibleChildren.length === 0) return;
        const gaps = this.gap * Math.max(0, visibleChildren.length - 1);
        let fixedH = 0;
        let flexCount = 0;
        for (const c of visibleChildren) {
            if (c.bounds.height > 0) fixedH += c.bounds.height;
            else flexCount++;
        }
        const flexH = flexCount > 0 ? Math.max(0, (innerH - fixedH - gaps) / flexCount) : 0;
        const x = this.bounds.x + this.padding;
        let cursorY = this.bounds.y + this.padding;
        for (const c of visibleChildren) {
            const h = c.bounds.height > 0 ? c.bounds.height : flexH;
            const w = c.bounds.width > 0 ? c.bounds.width : innerW;
            c.bounds = { x, y: cursorY, width: w, height: h };
            if (c instanceof UiVBox) c.layout();
            cursorY += h + this.gap;
        }
    }
}
