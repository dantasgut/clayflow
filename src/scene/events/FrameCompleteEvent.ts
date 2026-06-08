/**
 * Payload do evento `frameComplete` — emitido pelo `ExecutionSystem` ao fim
 * de cada frame (após record + submit). Útil para profiling, throttling
 * de updates não-críticos, e sincronizar UI com taxa de frames.
 */
export interface FrameCompleteEvent {
    /** Timestamp em ms (performance.now()) ao fim do frame. */
    readonly timestamp: number;
    /** Tempo gasto no frame (ms wall clock — record+submit). */
    readonly dt: number;
    /** Tempo total acumulado desde início do GameLoop (segundos). */
    readonly elapsed: number;
}
