export interface ProfilerTimestampWrites {
    readonly querySet: GPUQuerySet;
    readonly beginningOfPassWriteIndex?: number;
    readonly endOfPassWriteIndex?: number;
}

export interface Profiler {
    readonly isSupported: boolean;
    /**
     * Quadros medidos que ficaram sem leitura de GPU porque os quatro buffers de leitura estavam ocupados (a gravação
     * mais rápida que a GPU). Cresce só com o profiling por quadro ligado.
     */
    readonly droppedFrames: number;
    timestampWritesFor(first: number, last: number): ProfilerTimestampWrites | undefined;
    readRange(first: number, count: number): Promise<BigInt64Array>;
}
