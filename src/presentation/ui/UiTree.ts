import { UiElement } from './UiElement';

/**
 * UiTree é o container raiz da hierarquia UI. UIFlow expõe via `app.defaults.ui.ui`
 * para o app adicionar elementos top-level. UiFlattener percorre `tree.root.children`
 * recursivamente para gerar quads por frame.
 */
export class UiTree {
    /** Raiz oculta (UiElement abstrato vazio). Filhos diretos são os top-level UI. */
    readonly root: UiElement = new (class extends UiElement {})();

    /** Atalho — adiciona um elemento como filho da raiz. Chaining fluente. */
    add(element: UiElement): this {
        this.root.add(element);
        return this;
    }
}
