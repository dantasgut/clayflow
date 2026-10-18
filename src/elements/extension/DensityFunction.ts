import {
    ExtensionFunction,
    type ExtensionFunctionOptions,
} from '../../scene/contracts/ExtensionFunction';
import { fogDensityPoint } from '../media/shaders';

/**
 * Função do ponto `fog_density` (spec 033, R12) — a densidade de um meio participante por regra, em WGSL ou por um
 * grafo de nós:
 *
 * ```wgsl
 * fn density_fn(p: vec3f, time: f32, data: DensityFnParams) -> f32
 * ```
 *
 * A densidade relativa (≥ 0) no ponto `p` (mundo) no tempo simulado `time`, × a extinção do `FogVolume` da entidade;
 * `data` os parâmetros declarados. Criada pelo `FogVolume` com `density: { code }` ou `{ graph }` (ruído, campos) e
 * anexada à entidade dele; mudar valores não recompila. Resultado não finito ou negativo vale 0.
 */
export class DensityFunction extends ExtensionFunction {
    constructor(options: ExtensionFunctionOptions) {
        super(fogDensityPoint, options);
    }
}
