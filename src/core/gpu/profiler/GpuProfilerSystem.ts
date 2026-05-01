import type { Profiler, ProfilerTimestampWrites } from '../../contracts/Profiler';

export interface GpuProfilerOptions {
    /** Capacidade do QuerySet em número de timestamps. Default 64 = 32 passes. */
    readonly capacity?: number;
}

/**
 * GpuProfilerSystem real (timestamp-query opcional).
 *
 * Quando o device suporta a feature `timestamp-query`, aloca:
 *   - QuerySet de `capacity` slots
 *   - Buffer "resolve" (storage, QUERY_RESOLVE|COPY_SRC) onde resolveQuerySet
 *     escreve os timestamps em ns.
 *   - Buffer "staging" (COPY_DST|MAP_READ) para readback.
 *
 * Uso:
 *   profiler.attach(device);
 *   const tw = profiler.timestampWritesFor(0, 1);   // par primeiro/último de um pass
 *   pass.beginComputePass({ timestampWrites: tw });
 *   ...
 *   profiler.resolveOnto(encoder);                  // ao fim do encoder
 *   profiler.submitFrame(queue);                    // dispara map+readback async
 *   const ns = await profiler.readRange(0, 2);     // BigInt64Array em ns
 */
export class GpuProfilerSystem implements Profiler {
    private device: GPUDevice | null = null;
    private querySet: GPUQuerySet | null = null;
    private resolveBuffer: GPUBuffer | null = null;
    private stagingBuffer: GPUBuffer | null = null;
    private readonly capacity: number;
    private mapInProgress = false;
    private lastTimestamps: BigInt64Array = new BigInt64Array(0);

    constructor(options: GpuProfilerOptions = {}) {
        this.capacity = Math.max(2, options.capacity ?? 64);
    }

    attach(device: GPUDevice): void {
        this.device = device;
        if (!this.isSupported) return;
        if (this.querySet !== null) return;
        const byteSize = this.capacity * 8;
        this.querySet = device.createQuerySet({ type: 'timestamp', count: this.capacity });
        this.resolveBuffer = device.createBuffer({
            size: byteSize,
            usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
        });
        this.stagingBuffer = device.createBuffer({
            size: byteSize,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
        });
    }

    detach(): void {
        this.querySet?.destroy();
        this.resolveBuffer?.destroy();
        this.stagingBuffer?.destroy();
        this.querySet = null;
        this.resolveBuffer = null;
        this.stagingBuffer = null;
        this.device = null;
        this.mapInProgress = false;
        this.lastTimestamps = new BigInt64Array(0);
    }

    get isSupported(): boolean {
        if (this.device === null) return false;
        return this.device.features.has('timestamp-query');
    }

    timestampWritesFor(first: number, last: number): ProfilerTimestampWrites | undefined {
        if (this.querySet === null) return undefined;
        if (first < 0 || last >= this.capacity || first > last) return undefined;
        return {
            querySet: this.querySet,
            beginningOfPassWriteIndex: first,
            endOfPassWriteIndex: last,
        };
    }

    /**
     * Adiciona resolveQuerySet + copyBufferToBuffer ao encoder. Chamar uma
     * única vez por frame, depois de todos os passes que usaram este profiler.
     */
    resolveOnto(encoder: GPUCommandEncoder, count?: number): void {
        if (this.querySet === null || this.resolveBuffer === null || this.stagingBuffer === null)
            return;
        const n = count ?? this.capacity;
        encoder.resolveQuerySet(this.querySet, 0, n, this.resolveBuffer, 0);
        encoder.copyBufferToBuffer(this.resolveBuffer, 0, this.stagingBuffer, 0, n * 8);
    }

    /**
     * Mapeia o staging para leitura. Idempotente — se o último mapAsync ainda
     * está em flight, faz no-op e o caller usa `readRange` que retorna os
     * timestamps mais recentes já lidos.
     */
    submitFrame(): void {
        if (this.stagingBuffer === null || this.mapInProgress) return;
        this.mapInProgress = true;
        this.stagingBuffer
            .mapAsync(GPUMapMode.READ)
            .then(() => {
                const buf = this.stagingBuffer;
                if (buf === null) return;
                const range = buf.getMappedRange();
                this.lastTimestamps = new BigInt64Array(range.slice(0));
                buf.unmap();
                this.mapInProgress = false;
            })
            .catch(() => {
                this.mapInProgress = false;
            });
    }

    async readRange(first: number, count: number): Promise<BigInt64Array> {
        if (this.lastTimestamps.length === 0) return new BigInt64Array(count);
        return this.lastTimestamps.slice(first, first + count);
    }

    /**
     * Snapshot síncrono dos timestamps mais recentes (sem aguardar map).
     * Útil para overlay HUD que mostra valores do frame anterior.
     */
    snapshot(): BigInt64Array {
        return this.lastTimestamps;
    }
}
