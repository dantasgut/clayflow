export interface Profiler {
    readonly isSupported: boolean;
    /** True se o resultBuffer não está mapeado nem com mapAsync pendente — guard contra conflito entre profilers. */
    readonly canResolve: boolean;
    /**
     * Retorna o descriptor de timestampWrites para uso em beginComputePass/beginRenderPass.
     * API moderna WebGPU — substitui writeTimestamp() que foi removido da spec.
     * Retorna undefined se timestamp-query não estiver disponível.
     */
    timestampWritesForPass(beginIndex: number, endIndex: number): GPUComputePassTimestampWrites | undefined;
    /** @deprecated Usar timestampWritesForPass + beginComputePassExplicit com timestampWrites. */
    writeTimestamp(passEncoder: GPUComputePassEncoder | GPURenderPassEncoder | GPUCommandEncoder, queryIndex: number): void;
    resolveQueries(commandEncoder: GPUCommandEncoder, count: number): void;
    readResults(count: number): Promise<BigInt64Array | null>;
    /** Resolve apenas um intervalo [firstQuery, firstQuery+count) do QuerySet. */
    resolveQueriesRange(commandEncoder: GPUCommandEncoder, firstQuery: number, count: number): void;
    /** Lê apenas o intervalo [firstQuery, firstQuery+count) do result buffer (mapAsync parcial). */
    readResultsRange(firstQuery: number, count: number): Promise<BigInt64Array | null>;
}
