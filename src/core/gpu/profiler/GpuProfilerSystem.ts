import type { FrameProfilingGranularity } from '../../contracts/EngineCore';
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
 * Stagings de leitura em rodízio: enquanto um mapeia, os quadros seguintes resolvem nos outros. Com um só, os quadros
 * gravados durante o mapeamento ficavam sem leitura. O número independe do backend.
 */
export const STAGING_RING = 4;

/** Um staging do anel: ocupado do resolve até o fim do mapeamento. */
interface Staging {
    readonly buffer: GPUBuffer;
    busy: boolean;
}

/**
 * GpuProfilerSystem real (timestamp-query opcional).
 *
 * O QuerySet tem duas regiões:
 *   - `[0, capacity)` — índices manuais, via `timestampWritesFor(first, last)`
 *     (ex.: `ForwardFlow.setProfileTimestamps`).
 *   - `[capacity, capacity + frameCapacity)` — profiling por quadro. Granularidade `'passes'`:
 *     todo passe sem timestamps explícitos recebe um par de um `FrameTimestampAllocator`;
 *     passes com timestamps explícitos são respeitados e também somados. Granularidade
 *     `'frame'`: um único par por gravação — início no primeiro passe, fim nos passes de
 *     render — o total, sem amostrar cada passe de compute (o que, em quadros com dezenas
 *     de passes, pesa no próprio tempo medido).
 *
 * Ciclo por gravação: `beginFrame` → `passTimestampWrites` (um por passe) → `resolveOnto`
 * (só quando há timestamps a ler; no próximo staging livre do anel — sem nenhum livre o quadro fica sem leitura e
 * conta em `droppedFrames`) → `submitFrame` (readback assíncrono). Gravações sem passes medidos — ex.: `pool_grow:*` —
 * não resolvem nada e não substituem a última leitura; uma leitura de quadro mais antigo que a atual também não.
 */
export class GpuProfilerSystem implements Profiler {
    private device: GPUDevice | null = null;
    private querySet: GPUQuerySet | null = null;
    private resolveBuffer: GPUBuffer | null = null;
    private stagings: Staging[] = [];
    /** Staging escolhido pelo `resolveOnto` desta gravação (mapeado no `submitFrame`). */
    private current: Staging | null = null;
    private dropped = 0;
    private readonly capacity: number;
    private frameProfiling = false;
    private granularity: FrameProfilingGranularity = 'passes';
    /** Par da gravação aberto pelo primeiro passe (granularidade `'frame'`). */
    private span: TimestampPair | undefined = undefined;
    private frameCapacity = DEFAULT_FRAME_CAPACITY;
    private allocator: FrameTimestampAllocator;
    private manualUsed = false;
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
        this.manualUsed = false;
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
    configureFrameProfiling(
        enabled: boolean,
        capacity?: number,
        granularity: FrameProfilingGranularity = 'passes',
    ): void {
        const nextCapacity = Math.max(2, capacity ?? this.frameCapacity);
        const changed = enabled !== this.frameProfiling || nextCapacity !== this.frameCapacity;
        this.frameProfiling = enabled;
        this.granularity = granularity;
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
        this.current = null;
        this.span = undefined;
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
        kind: 'compute' | 'render' = 'render',
    ): ProfilerTimestampWrites | undefined {
        if (!this.frameProfilingActive || this.querySet === null) return explicit;
        if (this.granularity === 'frame') return explicit ?? this.frameSpanWrites(kind);
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
     * Granularidade `'frame'`: um par por gravação — o primeiro passe escreve o início e cada passe de render escreve o
     * fim no mesmo índice (vale o do último executado: o quadro apresentado termina num passe de render, e os passes de
     * render são poucos). Passes de compute depois do primeiro não são amostrados. Um passe marcador no fim não serve:
     * no Metal ele começa sem esperar os passes de render anteriores. Gravação só de compute fica sem leitura (use
     * `'passes'`).
     */
    private frameSpanWrites(kind: 'compute' | 'render'): ProfilerTimestampWrites | undefined {
        if (this.querySet === null) return undefined;
        if (this.span === undefined) {
            const pair = this.allocator.allocatePair('frame');
            if (pair === undefined) return undefined;
            this.span = pair;
            return {
                querySet: this.querySet,
                beginningOfPassWriteIndex: pair.first,
                ...(kind === 'render' ? { endOfPassWriteIndex: pair.last } : {}),
            };
        }
        if (kind !== 'render') return undefined;
        return { querySet: this.querySet, endOfPassWriteIndex: this.span.last };
    }

    /**
     * Adiciona resolveQuerySet + cópia para o próximo staging livre do anel, só quando há timestamps a ler neste
     * quadro. Sem staging livre, o quadro fica sem leitura (contado em `droppedFrames`).
     */
    resolveOnto(encoder: GPUCommandEncoder, count?: number): void {
        if (this.querySet === null || this.resolveBuffer === null || this.stagings.length === 0)
            return;
        const frameEnd = this.frameProfilingActive ? this.allocator.end : 0;
        const manualEnd = this.manualUsed ? this.capacity : 0;
        const n = count ?? Math.max(frameEnd, manualEnd);
        this.manualUsed = false;
        if (n === 0 || this.current !== null) return;
        const staging = this.stagings.find((s) => !s.busy);
        if (staging === undefined) {
            this.dropped++;
            return;
        }
        encoder.resolveQuerySet(this.querySet, 0, n, this.resolveBuffer, 0);
        encoder.copyBufferToBuffer(this.resolveBuffer, 0, staging.buffer, 0, n * 8);
        staging.busy = true;
        this.current = staging;
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
     * Mapeia o staging desta gravação para leitura. Com profiling por quadro, a leitura vira `lastFrameReading` ao
     * chegar (se for de um quadro mais novo que a atual).
     */
    submitFrame(): void {
        const staging = this.current;
        if (staging === null) return;
        this.current = null;
        const pending = this.pending;
        this.pending = null;
        staging.buffer
            .mapAsync(GPUMapMode.READ)
            .then(() => {
                if (!this.stagings.includes(staging)) return;
                const range = staging.buffer.getMappedRange();
                this.lastTimestamps = new BigInt64Array(range.slice(0));
                staging.buffer.unmap();
                staging.busy = false;
                if (pending !== null) this.acceptReading(pending);
            })
            .catch(() => {
                staging.busy = false;
            });
    }

    /** Quadros medidos que ficaram sem leitura por falta de staging livre (desde o `attach`). */
    get droppedFrames(): number {
        return this.dropped;
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
        if (this.reading !== undefined && pending.frameIndex <= this.reading.gpuFrame) return;
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
        this.stagings = Array.from({ length: STAGING_RING }, () => ({
            buffer: device.createBuffer({
                size: byteSize,
                usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
            }),
            busy: false,
        }));
        this.dropped = 0;
    }

    private releaseQueries(): void {
        this.querySet?.destroy();
        this.resolveBuffer?.destroy();
        for (const s of this.stagings) s.buffer.destroy();
        this.querySet = null;
        this.resolveBuffer = null;
        this.stagings = [];
        this.current = null;
        this.pending = null;
    }
}
