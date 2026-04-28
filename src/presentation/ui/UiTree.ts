import { UiElement } from './UiElement';

export class UiTree {
    readonly root: UiElement = new (class extends UiElement {})();

    add(element: UiElement): this {
        this.root.add(element);
        return this;
    }
}
