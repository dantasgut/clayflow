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
import { Loggable }         from '../../../core/debug/Loggable';
import { Logger }           from '../../../core/debug/Logger';

/** Índices de query para cada kernel de física rígida. */
export const PHYS_SLOTS = {
    predict:          { begin: 0, end: 1 },
    narrowphase:      { begin: 2, end: 3 },
    solve:            { begin: 4, end: 5 },
    velocityRecovery: { begin: 6, end: 7 },
} as const;

export const PHYS_QUERY_COUNT = 8;

@Loggable('GpuPhysicsProfiler')
export class GpuPhysicsProfiler {
    declare private readonly log: Logger;

    private readonly core     = WebGPUEngineCore.getInstance();
    /**
     * Iniciado em logInterval/2 para disparar em frames alternados ao GpuSoftBodyProfiler,
     * evitando colisão no `isMapped` compartilhado do ProfilerSystem.
     * Padrão: RigidBody dispara em frames 30, 90, 150... ; SoftBody em 60, 120, 180...
     */
    private frameCount        = 30;
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
     * Etapa 1/2 — encoda resolveQuerySet + copyBufferToBuffer no encoder.
     * DEVE ser chamado antes do submit. Retorna true se encodou (e startRead() deve
     * ser chamado após o submit).
     *
     * A resolução ocorre apenas a cada `logInterval` frames para minimizar overhead.
     */
    public encodeResolve(encoder: GPUCommandEncoder): boolean {
        if (!this.isActive) return false;

        this.frameCount++;
        if (this.frameCount % this.logInterval !== 0 || this.readPending) return false;
        // Guard compartilhado: evita submeter copyBufferToBuffer ao resultBuffer enquanto
        // outro profiler tem mapAsync pendente (ambos compartilham o mesmo buffer).
        if (!this.core.profiler.canResolve) return false;

        this.core.profiler.resolveQueries(encoder, PHYS_QUERY_COUNT);
        return true;
    }

    /**
     * Etapa 2/2 — inicia mapAsync no ResultBuffer.
     * DEVE ser chamado APÓS queue.submit([encoder]) — chamar antes coloca o buffer
     * em estado 'pending map', causando erro de validação no submit.
     */
    public startRead(): void {
        this.readPending = true;
        this.core.profiler.readResults(PHYS_QUERY_COUNT).then(ts => {
            this.readPending = false;
            if (ts) this.logTimestamps(ts);
        }).catch(() => { this.readPending = false; });
    }

    private logTimestamps(ts: BigInt64Array): void {
        const ms = (b: number, e: number) =>
            Number(ts[e]! - ts[b]!) / 1_000_000;

        const total = ms(0, 1) + ms(2, 3) + ms(4, 5) + ms(6, 7);
        this.log.info(
            `kernel ms (frame ${this.frameCount}): ` +
            `predict=${ms(0, 1).toFixed(3)} ` +
            `narrowphase=${ms(2, 3).toFixed(3)} ` +
            `solve=${ms(4, 5).toFixed(3)} ` +
            `vel_recovery=${ms(6, 7).toFixed(3)} ` +
            `| total=${total.toFixed(3)}ms`,
        );
    }
}
