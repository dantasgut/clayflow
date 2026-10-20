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
    /** Intervalos pelo caminho completo do passe (`fase/Flow/rótulo`), em ns. */
    readonly scopesNs: Readonly<Record<string, number>>;
}

interface PendingResolve {
    readonly frameIndex: number;
    readonly pairs: readonly TimestampPair[];
    readonly overflowed: boolean;
}

const DEFAULT_FRAME_CAPACITY = 256;

/**
 * Buffers de leitura em rodízio: com a CPU gravando à frente da GPU, um só buffer fica mapeando enquanto os quadros
 * seguintes passam sem amostra (e a última leitura se repete). Três cobrem os quadros em voo do laço.
 */
export const PROFILER_STAGING_RING = 3;

/** Um buffer de leitura do anel e a resolução que ele carrega. */
interface StagingSlot {
    readonly buffer: GPUBuffer;
    /** Mapeando ou com cópia gravada ainda não mapeada. */
    busy: boolean;
    pending: PendingResolve | null;
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
 * (só quando há timestamps a ler e o staging está livre) → `submitFrame` (readback
 * assíncrono). Gravações sem passes medidos — ex.: `pool_grow:*` — não resolvem nada e
 * não substituem a última leitura.
 */
export class GpuProfilerSystem implements Profiler {
    private device: GPUDevice | null = null;
    private querySet: GPUQuerySet | null = null;
    private resolveBuffer: GPUBuffer | null = null;
    private ring: StagingSlot[] = [];
    /** Buffer do anel com a cópia gravada neste quadro (mapeado no `submitFrame`). */
    private resolvedSlot: StagingSlot | null = null;
    /** Leituras chegadas e ainda não entregues (`takeFrameReadings`), na ordem de chegada. */
    private readonly arrived: FrameGpuReading[] = [];
    /** Quadros medidos sem buffer livre no anel (sem amostra). */
    private dropped = 0;
    private readonly capacity: number;
    private frameProfiling = false;
    private granularity: FrameProfilingGranularity = 'passes';
    /** Par da gravação aberto pelo primeiro passe (granularidade `'frame'`). */
    private span: TimestampPair | undefined = undefined;
    private frameCapacity = DEFAULT_FRAME_CAPACITY;
    private allocator: FrameTimestampAllocator;
    private manualUsed = false;
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
        this.reading = undefined;
        this.arrived.length = 0;
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
        this.resolvedSlot = null;
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
        scope = '',
    ): ProfilerTimestampWrites | undefined {
        if (!this.frameProfilingActive || this.querySet === null) return explicit;
        if (this.granularity === 'frame') return explicit ?? this.frameSpanWrites(kind);
        if (explicit !== undefined) {
            const first = explicit.beginningOfPassWriteIndex;
            const last = explicit.endOfPassWriteIndex;
            if (explicit.querySet === this.querySet && first !== undefined && last !== undefined) {
                this.allocator.registerExplicit({
                    first,
                    last,
                    label,
                    ...(scope !== '' ? { scope } : {}),
                });
            }
            return explicit;
        }
        const pair = this.allocator.allocatePair(label, scope);
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
     * Adiciona resolveQuerySet + cópia para um buffer livre do anel, só quando há timestamps a ler neste quadro; sem
     * buffer livre (a GPU atrasada além do anel), o quadro fica sem amostra e conta em `droppedFrames`.
     */
    resolveOnto(encoder: GPUCommandEncoder, count?: number): void {
        if (this.querySet === null || this.resolveBuffer === null || this.ring.length === 0) return;
        const frameEnd = this.frameProfilingActive ? this.allocator.end : 0;
        const manualEnd = this.manualUsed ? this.capacity : 0;
        const n = count ?? Math.max(frameEnd, manualEnd);
        this.manualUsed = false;
        if (n === 0) return;
        const slot = this.ring.find((x) => !x.busy);
        if (slot === undefined) {
            if (this.frameProfilingActive && this.allocator.pairs.length > 0) this.dropped++;
            return;
        }
        encoder.resolveQuerySet(this.querySet, 0, n, this.resolveBuffer, 0);
        encoder.copyBufferToBuffer(this.resolveBuffer, 0, slot.buffer, 0, n * 8);
        slot.busy = true;
        slot.pending =
            this.frameProfilingActive && this.allocator.pairs.length > 0
                ? {
                      frameIndex: this.allocator.frameIndex,
                      pairs: [...this.allocator.pairs],
                      overflowed: this.allocator.overflowed,
                  }
                : null;
        this.resolvedSlot = slot;
    }

    /**
     * Mapeia o buffer do anel com a cópia deste quadro. Cada leitura que chega entra uma vez na fila de
     * `takeFrameReadings` e, se for a mais nova, vira `lastFrameReading`.
     */
    submitFrame(): void {
        const slot = this.resolvedSlot;
        this.resolvedSlot = null;
        if (slot === null) return;
        const pending = slot.pending;
        slot.pending = null;
        slot.buffer
            .mapAsync(GPUMapMode.READ)
            .then(() => {
                if (!this.ring.includes(slot)) return;
                this.lastTimestamps = new BigInt64Array(slot.buffer.getMappedRange().slice(0));
                slot.buffer.unmap();
                slot.busy = false;
                if (pending !== null) this.acceptReading(pending);
            })
            .catch(() => {
                slot.busy = false;
            });
    }

    /** Leituras chegadas desde a última chamada, cada uma uma vez, na ordem de chegada. */
    takeFrameReadings(): FrameGpuReading[] {
        return this.arrived.splice(0, this.arrived.length);
    }

    /** Quadros medidos que ficaram sem amostra por falta de buffer livre no anel. */
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
        const gpuTimeMs = FrameTimestampAllocator.sumIntervals(this.lastTimestamps, pending.pairs);
        if (gpuTimeMs === undefined) return;
        const reading = {
            gpuTimeMs,
            gpuFrame: pending.frameIndex,
            stagesNs: FrameTimestampAllocator.intervalsByLabel(this.lastTimestamps, pending.pairs),
            scopesNs: FrameTimestampAllocator.intervalsByScope(this.lastTimestamps, pending.pairs),
        };
        this.arrived.push(reading);
        if (this.reading === undefined || reading.gpuFrame > this.reading.gpuFrame)
            this.reading = reading;
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
        this.ring = Array.from({ length: PROFILER_STAGING_RING }, () => ({
            buffer: device.createBuffer({
                size: byteSize,
                usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
            }),
            busy: false,
            pending: null,
        }));
    }

    private releaseQueries(): void {
        this.querySet?.destroy();
        this.resolveBuffer?.destroy();
        for (const slot of this.ring) slot.buffer.destroy();
        this.querySet = null;
        this.resolveBuffer = null;
        this.ring = [];
        this.resolvedSlot = null;
    }
}
