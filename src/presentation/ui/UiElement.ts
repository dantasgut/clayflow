export interface UiBounds {
    x: number;
    y: number;
    width: number;
    height: number;
}

export abstract class UiElement {
    bounds: UiBounds = { x: 0, y: 0, width: 0, height: 0 };
    visible = true;
    children: UiElement[] = [];

    add(child: UiElement): this {
        this.children.push(child);
        return this;
    }
}
