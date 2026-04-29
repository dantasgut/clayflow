import { UiElement } from './UiElement';

export class UiButton extends UiElement {
    label = '';
    hovered = false;
    pressed = false;
    onClick: (() => void) | undefined;
}
