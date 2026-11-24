import {
    ExtensionFunction,
    type ExtensionFunctionOptions,
} from '../../scene/contracts/ExtensionFunction';
import { displacementPoint } from '../geometry/shaders';

/**
 * Função do ponto `displacement` (spec 011) — o relevo de uma superfície como geometria, em WGSL ou por um grafo de
 * nós:
 *
 * ```wgsl
 * fn displacement_fn(s: SurfaceSample, data: DisplacementFnParams) -> f32
 * ```
 *
 * A altura, nas unidades da superfície, que move cada vértice ao longo da normal. `s` é a amostra de superfície do ponto
 * `material` preenchida para o vértice (uv, posição e normal locais, tangentes do uv) com o passo da malha no lugar das
 * derivadas de tela: os mesmos nós de padrão do material (`surface.uvSpace` → `pattern.*` → `surface.relief`) dão a
 * mesma altura, filtrada pelo que a malha resolve; a saída é `surface.displacement` (milímetros e a escala do mundo).
 * Anexada à entidade de uma `ParametricSurface`: o `SurfaceFlow` grava os vértices deslocados na GPU — o desenho, as
 * sombras e os raios leem essa geometria. Com a malha adaptativa (`adaptive`), os triângulos acompanham o tamanho na
 * tela (`screen`). A normal dos vértices continua a da superfície sem o relevo: a inclinação vem do material
 * (`surface.reliefNormal` sobre o mesmo relevo), até a largura do pixel. Mudar valores reavalia a superfície sem
 * recompilar. Uma instância por superfície.
 */
export class DisplacementFunction extends ExtensionFunction {
    constructor(options: ExtensionFunctionOptions) {
        super(displacementPoint, options);
    }
}
