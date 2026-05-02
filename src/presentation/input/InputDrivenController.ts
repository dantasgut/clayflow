import type { Input } from './Input';

/**
 * Contexto passado pelo InteractionSystem aos controllers em cada tick.
 * Contém `input` (state agregado) + `dt` (tempo desde último frame).
 */
export interface ControllerContext {
    /** Input state shared (key state, pointer deltas, etc.). */
    readonly input: Input;
    /** Delta time em segundos para integração frame-rate-independent. */
    readonly dt: number;
}

/**
 * Base abstrata de controllers (OrbitController, FpsController, FlyController).
 * Subclasses implementam `update(ctx)` chamado pelo InteractionSystem
 * em cada tick. Lê `ctx.input` e modifica resources do World (Camera,
 * Transform) conforme input.
 */
export abstract class InputDrivenController {
    /** Hook chamado a cada frameTick — leia input, atualize state externo. */
    abstract update(ctx: ControllerContext): void;
}
