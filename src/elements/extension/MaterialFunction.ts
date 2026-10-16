import {
    ExtensionFunction,
    type ExtensionFunctionOptions,
} from '../../scene/contracts/ExtensionFunction';
import { materialPoint } from '../material/point/shaders';

/**
 * Função do ponto `material` (spec 009) — a aparência de uma superfície por regra, em WGSL:
 *
 * ```wgsl
 * fn material_fn(s: SurfaceSample, m: StandardMaterial, data: MaterialFnParams) -> SurfaceParams
 * ```
 *
 * `s` traz a posição de mundo, a normal, o uv da geometria e o tempo simulado; `m` as constantes do material da
 * entidade; `data` os parâmetros declarados em `params`. Devolve cor base, rugosidade, metalicidade e emissão — o
 * desenho ilumina a cor base e soma a emissão (Cook-Torrance com rugosidade e metalicidade é da spec 011). Anexada a
 * uma entidade desenhada com `StandardMaterial`; até compilar, a entidade usa as constantes. Uma instância por
 * entidade; instâncias com o mesmo código compartilham o pipeline.
 */
export class MaterialFunction extends ExtensionFunction {
    constructor(options: ExtensionFunctionOptions) {
        super(materialPoint, options);
    }
}
