import { UiElement } from './UiElement';

/**
 * Container Z-stack: cada filho ocupa a área inteira do parent (menos padding),
 * sobreposto por ordem de inserção. Útil para HUDs (background + overlay).
 */
export class UiStack extends UiElement {
    /** Inset uniforme em todos os lados do container (CSS px). Default: 0. */
    padding = 0;

    /** Recalcula `bounds` de cada filho (todos ocupam a área do stack menos padding). */
    layout(): void {
        const x = this.bounds.x + this.padding;
        const y = this.bounds.y + this.padding;
        const w = Math.max(0, this.bounds.width - this.padding * 2);
        const h = Math.max(0, this.bounds.height - this.padding * 2);
        for (const c of this.children) {
            if (!c.visible) continue;
            c.bounds = { x, y, width: w, height: h };
        }
    }
}
