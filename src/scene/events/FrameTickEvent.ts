/**
 * Payload do evento `frameTick` — emitido a cada quadro por `Application.step()` e pelo `GameLoop`,
 * sempre depois de `time.advance()`. O `ExecutionSystem` grava o quadro em resposta.
 */
export interface FrameTickEvent {
    /** Duração efetiva do quadro em segundos (`realDt × time.scale`). */
    readonly dt: number;
    /** Duração real do quadro em segundos, limitada a `time.maxFrameDt`. */
    readonly realDt: number;
    /** Tempo efetivo acumulado (segundos). */
    readonly elapsed: number;
    /** Número do quadro (1 no primeiro avanço). */
    readonly frame: number;
}
