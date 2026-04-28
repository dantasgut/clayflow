import { UiElement } from './UiElement';

export class UiText extends UiElement {
    text = '';
    color: readonly [number, number, number, number] = [1, 1, 1, 1];
    fontSize = 14;
}
