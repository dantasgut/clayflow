import {
    ExtensionFunction,
    type ExtensionFunctionOptions,
} from '../../scene/contracts/ExtensionFunction';
import { fieldPoint } from '../physics/shaders/fields';

/**
 * Função do ponto `field` (spec 009) — um campo de força escrito pelo usuário em WGSL:
 *
 * ```wgsl
 * fn field_fn(x: vec3f, v: vec3f, time: f32, body: FieldBody, data: FieldFnParams) -> vec3f
 * ```
 *
 * Devolve a aceleração (m/s²) na posição `x` com velocidade `v`, no tempo simulado `time`; `body` traz massa inversa,
 * densidade e volume do corpo (0 quando o solver não os tem) e `data` os parâmetros declarados em `params`. Inserida
 * na cena (sozinha ou numa entidade), soma-se à gravidade e aos campos prontos em todos os solvers (rígido, XPBD, FEM,
 * MPM, SPH, PBF) e nos emissores — a C2 compõe as funções e recompila os estágios uma vez por mudança; até compilar,
 * vale a composição anterior. Resultado não finito não entra na soma.
 */
export class FieldFunction extends ExtensionFunction {
    /** Registro de parâmetros das funções `field` (o pool comum dos campos). */
    static readonly schema = fieldPoint.record;

    constructor(options: ExtensionFunctionOptions) {
        super(fieldPoint, options);
    }
}
