import {
    ExtensionFunction,
    type ExtensionFunctionOptions,
} from '../../scene/contracts/ExtensionFunction';
import { emitPoint } from '../particles/shaders';

/**
 * Função do ponto `emit` (spec 009) — como um emissor cria cada partícula, em WGSL:
 *
 * ```wgsl
 * fn emit_fn(i: u32, time: f32, seed: u32, data: EmitFnParams) -> EmittedParticle
 * ```
 *
 * `i` é o índice global da partícula no emissor (0, 1, 2… na ordem de criação), `time` o tempo simulado do passo,
 * `seed` a semente do emissor (`emit_rand(i, seed, canal)` sorteia em [0, 1)) e `data` os parâmetros declarados em
 * `params`. Devolve posição, velocidade, vida (s) e cor; vida ≤ 0 ou valor não finito: a partícula não nasce. Anexada
 * à entidade de um `ComputeParticleEmitter`, substitui a forma do emissor. Uma instância por emissor.
 */
export class EmitFunction extends ExtensionFunction {
    constructor(options: ExtensionFunctionOptions) {
        super(emitPoint, options);
    }
}
