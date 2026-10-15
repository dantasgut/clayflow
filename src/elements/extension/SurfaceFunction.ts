import {
    ExtensionFunction,
    type ExtensionFunctionOptions,
} from '../../scene/contracts/ExtensionFunction';
import { surfacePoint } from '../geometry/shaders';

/**
 * Função do ponto `surface` (spec 009) — uma superfície paramétrica escrita em WGSL:
 *
 * ```wgsl
 * fn surface_fn(u: f32, v: f32, time: f32, data: SurfaceFnParams) -> vec3f
 * // opcionais: derivadas analíticas (senão, diferenças centrais)
 * fn surface_du(u: f32, v: f32, time: f32, data: SurfaceFnParams) -> vec3f
 * fn surface_dv(u: f32, v: f32, time: f32, data: SurfaceFnParams) -> vec3f
 * ```
 *
 * O ponto em coordenadas locais para (u, v) no domínio da `ParametricSurface` da entidade, no tempo simulado `time`;
 * `data` os parâmetros declarados em `params`. A normal é du × dv (a face da frente fica desse lado). Anexada à
 * entidade de uma `ParametricSurface`, substitui a superfície pronta; com dependência do tempo, use `animated` na
 * superfície. Uma instância por superfície.
 */
export class SurfaceFunction extends ExtensionFunction {
    /** Registro de parâmetros das funções `surface` (um pool por ponto). */
    static readonly schema = surfacePoint.record;

    constructor(options: ExtensionFunctionOptions) {
        super(surfacePoint, options);
    }

    /** A função define as derivadas analíticas (`surface_du` e `surface_dv`). */
    get analytic(): boolean {
        return (
            this.optionalName('surface_du') !== undefined
            && this.optionalName('surface_dv') !== undefined
        );
    }

    /**
     * A função define as cinco derivadas (`surface_du`, `surface_dv`, `surface_duu`, `surface_duv`, `surface_dvv`): a
     * geometria diferencial usa o jato analítico (spec 010); com só parte delas, as segundas vêm por diferenças.
     */
    get analytic2(): boolean {
        return (
            this.analytic
            && this.optionalName('surface_duu') !== undefined
            && this.optionalName('surface_duv') !== undefined
            && this.optionalName('surface_dvv') !== undefined
        );
    }
}
