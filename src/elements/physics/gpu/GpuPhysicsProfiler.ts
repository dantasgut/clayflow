/**
 * GpuPhysicsProfiler — mede o tempo GPU de cada kernel do pipeline de física rígida.
 *
 * Usa GPUQuerySet com type='timestamp' (via ProfilerSystem da Layer 1) para registrar
 * os instantes begin/end de cada compute pass. A leitura é assíncrona e ocorre a cada
 * `logInterval` frames para não bloquear o pipeline de renderização.
 *
 * ## Slots de query (índices no GPUQuerySet compartilhado do ProfilerSystem)
 *
 * | Kernel             | begin | end |
 * |--------------------|-------|-----|
 * | rb_predict         |   0   |  1  |
 * | rb_narrowphase     |   2   |  3  |
 * | rb_solve           |   4   |  5  |
 * | rb_velocity_recovery|   6   |  7  |
 *
 * ## Uso no pipeline
 *
 * ```typescript
 * // Na abertura de cada pass:
 * compute.beginComputePassExplicit(encoder, 'rb_predict',
 *     profiler.timestampWritesFor(PHYS_SLOTS.predict));
 *
 * // Após o último pass do frame, antes do submit:
 * profiler.resolveAndScheduleRead(encoder);
 * ```
 *
 * Arquitetura: Layer 3 → Layer 1 via core.profiler (Profiler interface).
 */

import { WebGPUEngineCore } from '../../../core/WebGPUEngineCore';

/** Índices de query para cada kernel de física rígida. */
export const PHYS_SLOTS = {
    predict:          { begin: 0, end: 1 },
    narrowphase:      { begin: 2, end: 3 },
    solve:            { begin: 4, end: 5 },
    velocityRecovery: { begin: 6, end: 7 },
} as const;

export const PHYS_QUERY_COUNT = 8;

export class GpuPhysicsProfiler {

    private readonly core     = WebGPUEngineCore.getInstance();
    private frameCount        = 0;
    private readPending       = false;

    constructor(private readonly logInterval: number = 60) {}

    public get isActive(): boolean {
        return this.core.profiler.isSupported;
    }

    /**
     * Retorna o descriptor de timestampWrites para um slot.
     * Retorna undefined se timestamp-query não estiver disponível.
     */
    public timestampWritesFor(
        slot: { begin: number; end: number },
    ): GPUComputePassTimestampWrites | undefined {
        return this.core.profiler.timestampWritesForPass(slot.begin, slot.end);
    }

    /**
     * Registra resolveQuerySet + copyBufferToBuffer no encoder e agenda leitura assíncrona.
     * Deve ser chamado UMA VEZ por frame, após todos os compute passes, antes do submit.
     *
     * A resolução e leitura ocorrem apenas a cada `logInterval` frames para minimizar overhead.
     * O flag `readPending` evita leitura concorrente (mapAsync enquanto GPU ainda escreve).
     */
    public resolveAndScheduleRead(encoder: GPUCommandEncoder): void {
        if (!this.isActive) return;

        this.frameCount++;
        if (this.frameCount % this.logInterval !== 0 || this.readPending) return;
        // Guard compartilhado: evita submeter copyBufferToBuffer ao resultBuffer enquanto
        // outro profiler tem mapAsync pendente (ambos compartilham o mesmo buffer).
        if (!this.core.profiler.canResolve) return;

        // Grava resolução no encoder — executada pela GPU após os passes deste frame
        this.core.profiler.resolveQueries(encoder, PHYS_QUERY_COUNT);

        // Agenda leitura assíncrona; mapAsync espera a GPU terminar o copyBufferToBuffer
        this.readPending = true;
        this.core.profiler.readResults(PHYS_QUERY_COUNT).then(ts => {
            this.readPending = false;
            if (ts) this.logTimestamps(ts);
        }).catch(() => { this.readPending = false; });
    }

    private logTimestamps(ts: BigInt64Array): void {
        const ms = (b: number, e: number) =>
            Number(ts[e]! - ts[b]!) / 1_000_000;

        console.log(
            `[GpuPhysics] kernel ms (frame ${this.frameCount}):`,
            `predict=${ms(0, 1).toFixed(3)}`,
            `narrowphase=${ms(2, 3).toFixed(3)}`,
            `solve=${ms(4, 5).toFixed(3)}`,
            `vel_recovery=${ms(6, 7).toFixed(3)}`,
        );
    }
}
