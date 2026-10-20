/**
 * Estatísticas de um quadro, em vocabulário de domínio (sem tipos WebGPU).
 * Entregues em `frameComplete.stats` e por `EngineCore.lastFrameStats()`.
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
     * Chega com defasagem de 1–3 quadros; ver `gpuFrame`.
     */
    readonly gpuTimeMs?: number;
    /** Índice do quadro a que `gpuTimeMs` se refere. */
    readonly gpuFrame?: number;
    /**
     * Tempo de GPU por rótulo de passe (ns), da mesma leitura de `gpuTimeMs`
     * (ex.: `{ TransformFlow: 41000, forward: 820000 }`). Ausente junto com `gpuTimeMs`.
     */
    readonly stagesNs?: Readonly<Record<string, number>>;
    /** Tempo de GPU pelo caminho completo do passe (`fase/Flow/rótulo`, ns), da mesma leitura de `gpuTimeMs`. */
    readonly scopesNs?: Readonly<Record<string, number>>;
}

/**
 * Uma leitura de tempo de GPU de um quadro (spec 034): entregue uma única vez por `EngineCore.takeFrameTimings()`,
 * na ordem de chegada (a GPU termina 1–3 quadros depois da gravação).
 */
export interface FrameGpuTiming {
    /** Índice do quadro medido. */
    readonly gpuFrame: number;
    /** Soma dos passes medidos, em ms. */
    readonly gpuTimeMs: number;
    /** Por rótulo de passe (ns). */
    readonly stagesNs: Readonly<Record<string, number>>;
    /** Pelo caminho completo do passe (`fase/Flow/rótulo`, ns). */
    readonly scopesNs: Readonly<Record<string, number>>;
}
