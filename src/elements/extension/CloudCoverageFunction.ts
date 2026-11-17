import {
    ExtensionFunction,
    type ExtensionFunctionOptions,
} from '../../scene/contracts/ExtensionFunction';
import { cloudCoveragePoint } from '../media/clouds/shaders';

/** Opções da cobertura das nuvens: grafo de nós ou WGSL do ponto `cloud_coverage`. */
export type CloudCoverageOptions = ExtensionFunctionOptions;

/**
 * Função do ponto `cloud_coverage` (spec 041, R4) — onde há nuvens em grande escala, em WGSL ou por um grafo de nós:
 *
 * ```wgsl
 * fn coverage_fn(xz: vec2f, time: f32, data: CoverageFnParams) -> vec3f
 * ```
 *
 * A cobertura, o tipo (0 estrato, 0,5 cúmulo, 1 cúmulo-nimbo) e a densidade relativa no ponto horizontal `xz` (m, no
 * referencial que anda com o vento) no tempo simulado `time`. Avaliada na GPU pelo estágio das nuvens no mapa de
 * cobertura centrado na câmera, a cada quadro; mudar valores não recompila. Resultado não finito vale 0; fora de
 * [0, 1], saturado.
 */
export class CloudCoverageFunction extends ExtensionFunction {
    constructor(options: CloudCoverageOptions) {
        super(cloudCoveragePoint, options);
    }
}
