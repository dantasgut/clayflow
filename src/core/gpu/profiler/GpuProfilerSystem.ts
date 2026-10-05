import type { Profiler, ProfilerTimestampWrites } from '../../contracts/Profiler';
import { FrameTimestampAllocator, type TimestampPair } from './FrameTimestampAllocator';

export interface GpuProfilerOptions {
    /** Capacidade da região manual do QuerySet (timestamps). Default 64 = 32 passes. */
    readonly capacity?: number;
}

/** Última leitura de GPU resolvida por quadro (profiling por quadro ligado). */
export interface FrameGpuReading {
    /** Soma dos intervalos válidos de todos os passes do quadro, em ms. */
    readonly gpuTimeMs: number;
    /** Índice do quadro a que a leitura pertence. */
    readonly gpuFrame: number;
    /** Intervalos por rótulo de passe, em ns. */
    readonly stagesNs: Readonly<Record<string, number>>;
}

interface PendingResolve {
    readonly frameIndex: number;
    readonly pairs: readonly TimestampPair[];
    readonly overflowed: boolean;
}

const DEFAULT_FRAME_CAPACITY = 256;

/**
 * GpuProfilerSystem real (timestamp-query opcional).
 *
 * O QuerySet tem duas regiões:
 *   - `[0, capacity)` — índices manuais, via `timestampWritesFor(first, last)`
 *     (ex.: `ForwardFlow.setProfileTimestamps`).
 *   - `[capacity, capacity + frameCapacity)` — profiling por quadro: com ele ligado,
 *     todo passe sem timestamps explícitos recebe um par de um `FrameTimestampAllocator`;
 *     passes com timestamps explícitos são respeitados e também somados.
 *
 * Ciclo por gravação: `beginFrame` → `passTimestampWrites` (um por passe) → `resolveOnto`
 * (só quando há timestamps a ler e o staging está livre) → `submitFrame` (readback
 * assíncrono). Gravações sem passes medidos — ex.: `pool_grow:*` — não resolvem nada e
 * não substituem a última leitura.
 */
export class GpuProfilerSystem implements Profiler {
    private device: GPUDevice | null = null;
    private querySet: GPUQuerySet | null = null;
    private resolveBuffer: GPUBuffer | null = null;
    private stagingBuffer: GPUBuffer | null = null;
    private readonly capacity: number;
    private frameProfiling = false;
    private frameCapacity = DEFAULT_FRAME_CAPACITY;
    private allocator: FrameTimestampAllocator;
    private mapInProgress = false;
    private manualUsed = false;
    private resolvedThisFrame = false;
    private pending: PendingResolve | null = null;
    private reading: FrameGpuReading | undefined;
    private overflowWarned = false;
    private lastTimestamps: BigInt64Array = new BigInt64Array(0);

    constructor(options: GpuProfilerOptions = {}) {
        this.capacity = Math.max(2, options.capacity ?? 64);
        this.allocator = new FrameTimestampAllocator(this.frameCapacity, this.capacity);
    }

    attach(device: GPUDevice): void {
        this.device = device;
        if (!this.isSupported) return;
        if (this.querySet !== null) return;
        this.allocateQueries(device);
    }

    detach(): void {
        this.releaseQueries();
        this.device = null;
        this.mapInProgress = false;
        this.manualUsed = false;
        this.resolvedThisFrame = false;
        this.pending = null;
        this.reading = undefined;
        this.lastTimestamps = new BigInt64Array(0);
    }

    get isSupported(): boolean {
        if (this.device === null) return false;
        return this.device.features.has('timestamp-query');
    }

    /** True quando o profiling por quadro está ligado e o device mede timestamps. */
    get frameProfilingActive(): boolean {
        return this.frameProfiling && this.querySet !== null;
    }

    /**
     * Liga/desliga o profiling por quadro. `capacity` = timestamps por quadro (pares = passes
     * medidos). Recria o QuerySet quando o tamanho muda. Sem `timestamp-query`, guarda a
     * configuração e não mede nada.
     */
    configureFrameProfiling(enabled: boolean, capacity?: number): void {
        const nextCapacity = Math.max(2, capacity ?? this.frameCapacity);
        const changed = enabled !== this.frameProfiling || nextCapacity !== this.frameCapacity;
        this.frameProfiling = enabled;
        this.frameCapacity = nextCapacity;
        this.allocator = new FrameTimestampAllocator(this.frameCapacity, this.capacity);
        this.overflowWarned = false;
        if (!changed || this.device === null || !this.isSupported) return;
        this.releaseQueries();
        this.allocateQueries(this.device);
    }

    timestampWritesFor(first: number, last: number): ProfilerTimestampWrites | undefined {
        if (this.querySet === null) return undefined;
        if (first < 0 || last >= this.capacity || first > last) return undefined;
        this.manualUsed = true;
        return {
            querySet: this.querySet,
            beginningOfPassWriteIndex: first,
            endOfPassWriteIndex: last,
        };
    }

    /** Abre uma gravação: zera os pares do quadro. */
    beginFrame(frameIndex: number): void {
        this.resolvedThisFrame = false;
        if (this.frameProfilingActive) this.allocator.begin(frameIndex);
    }

    /**
     * Timestamps de um passe. Com profiling por quadro ligado: explícitos são respeitados e
     * registrados para a soma; os demais recebem um par automático. Desligado: devolve os
     * explícitos (ou nada).
     */
    passTimestampWrites(
        label: string,
        explicit?: ProfilerTimestampWrites,
    ): ProfilerTimestampWrites | undefined {
        if (!this.frameProfilingActive || this.querySet === null) return explicit;
        if (explicit !== undefined) {
            const first = explicit.beginningOfPassWriteIndex;
            const last = explicit.endOfPassWriteIndex;
            if (explicit.querySet === this.querySet && first !== undefined && last !== undefined) {
                this.allocator.registerExplicit({ first, last, label });
            }
            return explicit;
        }
        const pair = this.allocator.allocatePair(label);
        if (pair === undefined) {
            this.warnOverflow();
            return undefined;
        }
        return {
            querySet: this.querySet,
            beginningOfPassWriteIndex: pair.first,
            endOfPassWriteIndex: pair.last,
        };
    }

    /**
     * Adiciona resolveQuerySet + cópia para o staging ao encoder, só quando há timestamps
     * a ler neste quadro e o staging anterior não está mapeando (senão pula o quadro).
     */
    resolveOnto(encoder: GPUCommandEncoder, count?: number): void {
        if (this.querySet === null || this.resolveBuffer === null || this.stagingBuffer === null)
            return;
        const frameEnd = this.frameProfilingActive ? this.allocator.end : 0;
        const manualEnd = this.manualUsed ? this.capacity : 0;
        const n = count ?? Math.max(frameEnd, manualEnd);
        this.manualUsed = false;
        if (n === 0 || this.mapInProgress) return;
        encoder.resolveQuerySet(this.querySet, 0, n, this.resolveBuffer, 0);
        encoder.copyBufferToBuffer(this.resolveBuffer, 0, this.stagingBuffer, 0, n * 8);
        this.resolvedThisFrame = true;
        this.pending =
            this.frameProfilingActive && this.allocator.pairs.length > 0
                ? {
                      frameIndex: this.allocator.frameIndex,
                      pairs: [...this.allocator.pairs],
                      overflowed: this.allocator.overflowed,
                  }
                : null;
    }

    /**
     * Mapeia o staging para leitura quando este quadro resolveu timestamps. Com profiling
     * por quadro, a leitura vira `lastFrameReading` ao chegar.
     */
    submitFrame(): void {
        if (this.stagingBuffer === null || this.mapInProgress || !this.resolvedThisFrame) return;
        this.resolvedThisFrame = false;
        this.mapInProgress = true;
        const pending = this.pending;
        this.pending = null;
        this.stagingBuffer
            .mapAsync(GPUMapMode.READ)
            .then(() => {
                const buf = this.stagingBuffer;
                if (buf === null) return;
                const range = buf.getMappedRange();
                this.lastTimestamps = new BigInt64Array(range.slice(0));
                buf.unmap();
                this.mapInProgress = false;
                if (pending !== null) this.acceptReading(pending);
            })
            .catch(() => {
                this.mapInProgress = false;
            });
    }

    /** Última leitura por quadro resolvida (undefined até a primeira, ou sem profiling). */
    get lastFrameReading(): FrameGpuReading | undefined {
        return this.reading;
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

    private acceptReading(pending: PendingResolve): void {
        if (pending.overflowed) return;
        const gpuTimeMs = FrameTimestampAllocator.sumIntervals(this.lastTimestamps, pending.pairs);
        if (gpuTimeMs === undefined) return;
        this.reading = {
            gpuTimeMs,
            gpuFrame: pending.frameIndex,
            stagesNs: FrameTimestampAllocator.intervalsByLabel(this.lastTimestamps, pending.pairs),
        };
    }

    private warnOverflow(): void {
        if (this.overflowWarned) return;
        this.overflowWarned = true;
        console.warn(
            `[clayflow] profiling: mais passes no quadro do que a capacidade (${this.frameCapacity / 2}); `
                + 'gpuTimeMs fica ausente nesses quadros — aumente `profilingCapacity`.',
        );
    }

    private allocateQueries(device: GPUDevice): void {
        const count = this.capacity + (this.frameProfiling ? this.frameCapacity : 0);
        const byteSize = count * 8;
        this.querySet = device.createQuerySet({ type: 'timestamp', count });
        this.resolveBuffer = device.createBuffer({
            size: byteSize,
            usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
        });
        this.stagingBuffer = device.createBuffer({
            size: byteSize,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
        });
    }

    private releaseQueries(): void {
        this.querySet?.destroy();
        this.resolveBuffer?.destroy();
        this.stagingBuffer?.destroy();
        this.querySet = null;
        this.resolveBuffer = null;
        this.stagingBuffer = null;
        this.mapInProgress = false;
        this.pending = null;
        this.resolvedThisFrame = false;
    }
}
