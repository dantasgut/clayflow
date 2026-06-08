import { UiElement } from './UiElement';

/**
 * Botão clicável. UiInteractionHandler atualiza `hovered`/`pressed` baseado
 * em pointer events (intersect bounds). UiFlattener gera quad com cor
 * variando por estado: idle / hovered / pressed.
 */
export class UiButton extends UiElement {
    /** Texto exibido (não renderizado pelo button — adicione UiText filho se quiser label). */
    label = '';
    /** True se cursor está sobre o button (atualizado por UiInteractionHandler). */
    hovered = false;
    /** True enquanto o botão está mouse-down (após pointerdown, antes de pointerup). */
    pressed = false;
    /** Callback chamado em click (pointerup dentro de bounds após pointerdown nele). */
    onClick: (() => void) | undefined;
}
