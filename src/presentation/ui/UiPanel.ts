import { UiElement } from './UiElement';

/**
 * Painel — retângulo colorido na UI. Container conceitual para outros
 * elements via `parts` (composição via Entity).
 */
export class UiPanel extends UiElement {
    /** Cor de fundo RGBA (premultiplied alpha). Default: 50% black. */
    background: readonly [number, number, number, number] = [0, 0, 0, 0.5];
}
