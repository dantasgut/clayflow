/**
 * Estatísticas de um quadro, em vocabulário de domínio (sem tipos WebGPU).
 * Entregues em `frameComplete.stats` e por `EngineCore.lastFrameStats()`. Os campos de GPU (`gpuTimeMs`, `gpuFrame`,
 * `stagesNs`) aparecem num único `frameComplete` por leitura — o do quadro em que ela chegou; `lastFrameStats()`
 * devolve sempre a última leitura resolvida (para consultas avulsas, como um HUD).
 */
export interface FrameStats {
    /** Draw calls emitidos no quadro (diretos, indiretos e dentro de bundles executados). */
    readonly drawCalls: number;
    /** Dispatches de compute no quadro (diretos + indiretos). */
    readonly dispatches: number;
    /** Passes render + compute abertos no quadro. */
    readonly passes: number;
    /**
     * Tempo de GPU somado de todos os passes, em ms. Ausente quando o profiling está desligado,
     * o dispositivo não suporta timestamps, a capacidade estourou ou ainda não há leitura resolvida.
     * Chega com defasagem de alguns quadros (readback assíncrono); `gpuFrame` diz de qual quadro é, e cada quadro
     * medido aparece em no máximo um `frameComplete`.
     */
    readonly gpuTimeMs?: number;
    /** Índice do quadro a que `gpuTimeMs` se refere. */
    readonly gpuFrame?: number;
    /**
     * Tempo de GPU por rótulo de passe (ns), da mesma leitura de `gpuTimeMs`
     * (ex.: `{ TransformFlow: 41000, forward: 820000 }`). Ausente junto com `gpuTimeMs`.
     */
    readonly stagesNs?: Readonly<Record<string, number>>;
}
