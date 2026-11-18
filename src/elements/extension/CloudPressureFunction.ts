import {
    ExtensionFunction,
    type ExtensionFunctionOptions,
} from '../../scene/contracts/ExtensionFunction';
import { cloudPressurePoint } from '../media/clouds/shaders';

/** Opções do campo de pressão das nuvens: grafo de nós ou WGSL do ponto `cloud_pressure`. */
export type CloudPressureOptions = ExtensionFunctionOptions;

/**
 * Função do ponto `cloud_pressure` (spec 041, R19) — o campo de pressão em escala sinótica que dita o tempo das nuvens,
 * em WGSL ou por um grafo de nós:
 *
 * ```wgsl
 * fn pressure_fn(xz: vec2f, time: f32, data: PressureFnParams) -> f32
 * ```
 *
 * A anomalia de pressão (Pa, em torno da média) no ponto horizontal `xz` (m, no referencial que anda com o vento de
 * condução da camada; leste = +x, norte = −z) no tempo simulado `time` (s). Avaliada na GPU no quadrado do tempo a cada
 * quadro (9 vezes por texel: o estêncil das derivadas); dela vêm o vento das nuvens (equilibrado com a pressão), a
 * subida nas baixas, a subsidência nas altas e as frentes. Mudar valores não recompila. Resultado não finito vale 0.
 */
export class CloudPressureFunction extends ExtensionFunction {
    constructor(options: CloudPressureOptions) {
        super(cloudPressurePoint, options);
    }
}
