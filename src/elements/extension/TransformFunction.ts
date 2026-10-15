import {
    ExtensionFunction,
    type ExtensionFunctionOptions,
} from '../../scene/contracts/ExtensionFunction';
import { transformPoint } from '../scene/flows/shaders';

/**
 * Função do ponto `transform` (spec 009) — a matriz local de uma entidade escrita pelo usuário em WGSL:
 *
 * ```wgsl
 * fn transform_fn(slot: u32, t: Transform, data: TransformFnParams, time: f32) -> mat4x4f
 * ```
 *
 * `slot` é o índice do `Transform` no pool, `t` a intenção (posição, rotação, escala; `transform_local(t).world` dá o
 * TRS), `data` os parâmetros declarados em `params` (struct `TransformFnParams`) e `time` o tempo simulado (s). Anexada
 * a uma entidade com `Transform`, substitui o TRS dela; o `Parent` compõe sobre o resultado. Uma instância por
 * entidade (cada uma com os seus valores); instâncias com o mesmo código compartilham o pipeline e formam um grupo (um
 * despacho por código, não por entidade). Matriz com valor não finito mantém o TRS.
 */
export class TransformFunction extends ExtensionFunction {
    /** Registro de parâmetros das funções `transform` (um pool por ponto). */
    static readonly schema = transformPoint.record;

    constructor(options: ExtensionFunctionOptions) {
        super(transformPoint, options);
    }
}
