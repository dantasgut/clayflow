import {
    ExtensionFunction,
    type ExtensionFunctionOptions,
} from '../../scene/contracts/ExtensionFunction';
import { spacePoint } from '../geometry/shaders';

/**
 * Função do ponto `space` (spec 009) — uma deformação do espaço escrita em WGSL:
 *
 * ```wgsl
 * fn space_fn(x: vec3f, time: f32, data: SpaceFnParams) -> vec3f
 * // opcional: Jacobiana (senão, diferenças centrais)
 * fn space_jacobian(x: vec3f, time: f32, data: SpaceFnParams) -> mat3x3f
 * ```
 *
 * Inserida na cena (sozinha ou numa entidade), deforma as superfícies paramétricas (`ParametricSurface`) nas
 * coordenadas locais delas: o ponto vai a `space_fn(x)` e a normal pela inversa transposta da Jacobiana (singular:
 * mantém a normal). Várias funções aplicam-se em sequência. A aplicação à cena inteira (malhas, luz, sombra) é da
 * spec 019.
 */
export class SpaceFunction extends ExtensionFunction {
    constructor(options: ExtensionFunctionOptions) {
        super(spacePoint, options);
    }
}
