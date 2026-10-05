/**
 * Payload do evento `frameRecording` — emitido pelo `ExecutionSystem` imediatamente
 * antes de gravar os passes do quadro (`core.record`). O `ResourceSystem` reage
 * enviando à GPU, uma única vez, os recursos marcados como sujos desde o quadro
 * anterior.
 *
 * Ordem por quadro: `frameTick` → `frameRecording` → gravação dos estágios por fase →
 * `submit` → `frameComplete`.
 */
export interface FrameRecordingEvent {
    /** Tempo acumulado da simulação em segundos — o mesmo do `frameTick` de origem. */
    readonly elapsed: number;
}
