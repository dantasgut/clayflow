import type { FrameStats } from '../../core/contracts/FrameStats';

/**
 * Payload do evento `frameComplete` — emitido pelo `ExecutionSystem` ao fim
 * de cada frame (após record + submit). Útil para profiling, throttling
 * de updates não-críticos, e sincronizar UI com taxa de frames.
 */
export interface FrameCompleteEvent {
    /** Timestamp em ms (performance.now()) ao fim do frame. */
    readonly timestamp: number;
    /**
     * Tempo de CPU do frame (ms wall clock): envio dos dados alterados (`frameRecording`)
     * + gravação dos estágios + submit. Trabalho em callbacks assíncronos (ex.: pose da
     * física publicada no readback) fica fora.
     */
    readonly dt: number;
    /** Tempo total acumulado desde início do GameLoop (segundos). */
    readonly elapsed: number;
    /** Estatísticas do frame recém-submetido (draws, dispatches, passes, tempo de GPU). */
    readonly stats: FrameStats;
}
