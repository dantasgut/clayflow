import { UiElement } from './UiElement';

export class UiSlider extends UiElement {
    value = 0;
    min = 0;
    max = 1;
    onChange: ((v: number) => void) | undefined;
}
