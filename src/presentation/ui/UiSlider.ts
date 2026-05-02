import { UiElement } from './UiElement';

/**
 * Slider horizontal. Valor `value` ∈ [`min`, `max`]; UiInteractionHandler
 * atualiza via drag (delta_x sobre bounds.width). UiFlattener desenha
 * background bar + handle quad na posição interpolada.
 */
export class UiSlider extends UiElement {
    /** Valor atual (lerp entre min e max conforme posição do handle). */
    value = 0;
    /** Limite mínimo. */
    min = 0;
    /** Limite máximo. */
    max = 1;
    /** Callback chamado em cada mudança de value durante o drag. */
    onChange: ((v: number) => void) | undefined;
}
