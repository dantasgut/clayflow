import { UiElement } from './UiElement';

export class UiButton extends UiElement {
    label = '';
    onClick: (() => void) | undefined;
}
