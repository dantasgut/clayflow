export interface ProfilerTimestampWrites {
    readonly querySet: GPUQuerySet;
    readonly beginningOfPassWriteIndex?: number;
    readonly endOfPassWriteIndex?: number;
}

export interface Profiler {
    readonly isSupported: boolean;
    timestampWritesFor(first: number, last: number): ProfilerTimestampWrites | undefined;
    readRange(first: number, count: number): Promise<BigInt64Array>;
}
