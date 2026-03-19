export interface Profiler {
    readonly isSupported: boolean;
    writeTimestamp(passEncoder: GPUComputePassEncoder | GPURenderPassEncoder | GPUCommandEncoder, queryIndex: number): void;
    resolveQueries(commandEncoder: GPUCommandEncoder, count: number): void;
    readResults(count: number): Promise<BigInt64Array | null>;
}
