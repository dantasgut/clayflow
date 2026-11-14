import { Renderer, type RendererOptions } from '../../elements/render/Renderer';
import { ToneMapping } from './ToneMapping';

/**
 * O renderizador da cena na apresentação (spec 039, D7): o `Renderer` da C3 (caminhos de luz, cáusticas,
 * antisserrilhado, filtro temporal, perfil) com a saída — exposição, mapeamento de tons e o formato do canvas
 * (`ToneMapping`), lida pelo pós. Um por cena, inserido pelos estágios padrão (`app.defaults.renderer`).
 */
export class SceneRenderer extends Renderer {
    /** A saída: exposição, mapeamento de tons e saída (`output.data.exposure = 1`). */
    readonly output: ToneMapping;

    constructor(options: RendererOptions = {}) {
        super(options);
        this.output = new ToneMapping();
        this.add(this.output);
    }
}
