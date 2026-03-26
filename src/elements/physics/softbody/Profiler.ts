/**
 * GpuSoftBodyProfiler — mede o tempo GPU de cada estágio do pipeline de física SoftBody.
 *
 * Usa os slots 8–17 do GPUQuerySet compartilhado do ProfilerSystem (slots 0–7 são do RigidBody).
 * Mede apenas o PRIMEIRO SoftBody do frame e apenas o PRIMEIRO substep como amostra representativa.
 *
 * ## Slots de query
 *
 * | Kernel            | begin | end |
 * |-------------------|-------|-----|
 * | sb_predict        |   8   |  9  |
 * | sb_constraints    |  10   | 11  |
 * | sb_collision      |  12   | 13  |
 * | sb_velocity       |  14   | 15  |
 * | sb_vertex_write   |  16   | 17  |
 *
 * Para graph coloring, `sb_constraints` mede o `colorPass` completo (todas as cores × iters do substep 0).
 * Para Jacobi, mede apenas o primeiro `solvePass` de substep 0, iter 0.
 * Para serial, mede o `serialPass` completo de substep 0.
 *
 * ## Uso no pipeline
 *
 * ```typescript
 * // Antes do loop de bodies:
 * let firstBodyProfiled = false;
 *
 * // Dentro do encode do primeiro body, substep 0:
 * compute.beginComputePassExplicit(encoder, 'phys_sub_0',
 *     shouldProfile ? softProfiler.timestampWritesFor(SB_SLOTS.predict) : undefined);
 *
 * // Após vertex_write do primeiro body:
 * softProfiler.resolveAndScheduleRead(encoder);
 * ```
 *
 * Arquitetura: Layer 3 → Layer 1 via core.profiler (Profiler interface).
 */

import { WebGPUEngineCore } from '../../../core/WebGPUEngineCore';
import { Loggable }         from '../../../core/debug/Loggable';
import { Logger }           from '../../../core/debug/Logger';

/** Índices de query para cada estágio do pipeline SoftBody (slots 8–17). */
export const SB_SLOTS = {
    predict:     { begin: 8,  end: 9  },
    constraints: { begin: 10, end: 11 },
    collision:   { begin: 12, end: 13 },
    velocity:    { begin: 14, end: 15 },
    vertexWrite: { begin: 16, end: 17 },
} as const;

const SB_FIRST_QUERY = 8;
const SB_QUERY_COUNT = 10;  // 5 kernels × 2 slots

@Loggable('GpuSoftBodyProfiler')
export class GpuSoftBodyProfiler {
    declare private readonly log: Logger;

    private readonly core  = WebGPUEngineCore.getInstance();
    private frameCount     = 0;
    private readPending    = false;

    constructor(private readonly logInterval: number = 60) {}

    public get isActive(): boolean {
        return this.core.profiler.isSupported;
    }

    /**
     * Retorna o descriptor de timestampWrites para um slot SoftBody.
     * Retorna undefined se timestamp-query não estiver disponível.
     */
    public timestampWritesFor(
        slot: { begin: number; end: number },
    ): GPUComputePassTimestampWrites | undefined {
        return this.core.profiler.timestampWritesForPass(slot.begin, slot.end);
    }

    /**
     * Etapa 1/2 — encoda resolveQueriesRange + copyBufferToBuffer no encoder (slots 8–17).
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

        this.core.profiler.resolveQueriesRange(encoder, SB_FIRST_QUERY, SB_QUERY_COUNT);
        return true;
    }

    /**
     * Etapa 2/2 — inicia mapAsync no ResultBuffer.
     * DEVE ser chamado APÓS queue.submit([encoder]) — chamar antes coloca o buffer
     * em estado 'pending map', causando erro de validação no submit.
     */
    public startRead(): void {
        this.readPending = true;
        this.core.profiler.readResultsRange(SB_FIRST_QUERY, SB_QUERY_COUNT).then(ts => {
            this.readPending = false;
            if (ts) this.logTimestamps(ts);
        }).catch(() => { this.readPending = false; });
    }

    private logTimestamps(ts: BigInt64Array): void {
        // ts é indexado a partir de 0 (relativo a SB_FIRST_QUERY — já ajustado por readResultsRange)
        const ms = (b: number, e: number) =>
            Number(ts[e]! - ts[b]!) / 1_000_000;

        const total = ms(0, 1) + ms(2, 3) + ms(4, 5) + ms(6, 7) + ms(8, 9);
        this.log.info(
            `kernel ms (frame ${this.frameCount}): ` +
            `predict=${ms(0, 1).toFixed(3)} ` +
            `constraints=${ms(2, 3).toFixed(3)} ` +
            `collision=${ms(4, 5).toFixed(3)} ` +
            `velocity=${ms(6, 7).toFixed(3)} ` +
            `vertex_write=${ms(8, 9).toFixed(3)} ` +
            `| total_sub0=${total.toFixed(3)}ms`,
        );
    }
}
