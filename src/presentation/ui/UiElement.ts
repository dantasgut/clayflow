/**
 * Bounds retangulares de um UiElement em coordenadas de tela (pixels).
 * Origem no canto superior esquerdo do canvas (y cresce pra baixo).
 */
export interface UiBounds {
    /** Posição X em pixels do canto superior esquerdo. */
    x: number;
    /** Posição Y em pixels do canto superior esquerdo. */
    y: number;
    /** Largura em pixels. */
    width: number;
    /** Altura em pixels. */
    height: number;
}

/**
 * UiElement é a base de todos os elementos UI (Panel, Button, Slider, Text).
 * Composição via árvore — cada elemento tem `bounds` próprios e `children`
 * renderizados por cima. UIFlow + UiFlattener percorrem essa árvore para
 * gerar `UiQuadCpu[]` enviados ao GPU pelo UiGpuPipeline.
 *
 * Subclasses concretas: UiPanel, UiButton, UiSlider, UiText, UiHBox, UiVBox.
 * Layout (HBox/VBox) calcula bounds dos filhos automaticamente.
 */
export abstract class UiElement {
    /** Posição + tamanho em pixels de tela. Setado pelo layout ou manualmente. */
    bounds: UiBounds = { x: 0, y: 0, width: 0, height: 0 };
    /** Quando false, o elemento e seus filhos não são renderizados. */
    visible = true;
    /** Filhos diretos. Renderizados após o pai (z-order natural). */
    children: UiElement[] = [];

    /** Anexa um UiElement filho. Chaining fluente. */
    add(child: UiElement): this {
        this.children.push(child);
        return this;
    }
}
