import type { Metrics, RepetitionSamples } from './types';

/** Leituras de GPU que bastam numa repetição para a métrica valer (senão `null`). */
export const MIN_GPU_SAMPLES = 30;

/**
 * Mínimo exigido numa repetição: 30 leituras, ou um quarto dos quadros quando a cena é tão
 * lenta que a janela tem poucos quadros (ao menos 1).
 */
export function minGpuSamples(frames: number): number {
    return Math.min(MIN_GPU_SAMPLES, Math.max(1, Math.ceil(frames / 4)));
}
/** Coeficiente de variação entre repetições acima do qual a linha é "instável". */
export const UNSTABLE_CV = 0.05;
/** Taxas de vsync comuns: FPS a ±2% de uma delas é marcado como limitado pela vsync. */
const VSYNC_RATES = [60, 120, 144] as const;

/** Média aritmética (0 para lista vazia). */
export function mean(values: readonly number[]): number {
    if (values.length === 0) return 0;
    let sum = 0;
    for (const v of values) sum += v;
    return sum / values.length;
}

/** Percentil `p` ∈ [0, 100] com interpolação linear entre vizinhos (NaN para lista vazia). */
export function percentile(values: readonly number[], p: number): number {
    if (values.length === 0) return Number.NaN;
    const sorted = [...values].sort((a, b) => a - b);
    const rank = (Math.min(100, Math.max(0, p)) / 100) * (sorted.length - 1);
    const lo = Math.floor(rank);
    const hi = Math.ceil(rank);
    const a = sorted[lo] ?? Number.NaN;
    const b = sorted[hi] ?? a;
    return a + (b - a) * (rank - lo);
}

/** Mediana (percentil 50). */
export function median(values: readonly number[]): number {
    return percentile(values, 50);
}

/** Desvio padrão amostral ÷ média (0 com menos de 2 valores ou média 0). */
export function coefficientOfVariation(values: readonly number[]): number {
    if (values.length < 2) return 0;
    const m = mean(values);
    if (m === 0) return 0;
    let acc = 0;
    for (const v of values) acc += (v - m) ** 2;
    return Math.sqrt(acc / (values.length - 1)) / m;
}

/** True se o FPS ficou a ±2% de uma taxa de vsync comum. */
export function isVsyncLimited(fps: number): boolean {
    return VSYNC_RATES.some((rate) => Math.abs(fps - rate) / rate <= 0.02);
}

/** Métricas de uma repetição a partir das amostras brutas da página. */
export function summarizeRepetition(s: RepetitionSamples): Metrics {
    const frameMean = mean(s.frameMs);
    const fps = frameMean > 0 ? 1000 / frameMean : 0;
    return {
        cpuMs: median(s.cpuMs),
        gpuMs: s.gpuMs.length >= minGpuSamples(s.frameMs.length) ? median(s.gpuMs) : null,
        frameMs: {
            mean: frameMean,
            p95: percentile(s.frameMs, 95),
            p99: percentile(s.frameMs, 99),
        },
        fps,
        drawCalls: median(s.drawCalls),
        memoryBytes: s.memoryBytes,
        memoryKind: s.memoryKind,
        samples: { frames: s.frameMs.length, gpu: s.gpuMs.length },
        vsyncLimited: isVsyncLimited(fps),
    };
}

/** Agregado de repetições: valor reportado e estabilidade. */
export interface Aggregate {
    readonly metrics: Metrics;
    /** CV do tempo médio de quadro entre repetições. */
    readonly cv: number;
    readonly unstable: boolean;
}

/**
 * Mediana das medianas das repetições (R5). `gpuMs` = mediana das repetições com leitura
 * válida, `null` se nenhuma tiver. Instável quando o CV do tempo médio de quadro passa de 5%.
 */
export function aggregateRepetitions(reps: readonly Metrics[]): Aggregate {
    if (reps.length === 0) throw new Error('aggregateRepetitions: nenhuma repetição.');
    const pick = (f: (m: Metrics) => number): number => median(reps.map(f));
    const gpu = reps.map((r) => r.gpuMs).filter((g): g is number => g !== null);
    const frameMean = pick((r) => r.frameMs.mean);
    const fps = frameMean > 0 ? 1000 / frameMean : 0;
    const cv = coefficientOfVariation(reps.map((r) => r.frameMs.mean));
    return {
        metrics: {
            cpuMs: pick((r) => r.cpuMs),
            gpuMs: gpu.length > 0 ? median(gpu) : null,
            frameMs: {
                mean: frameMean,
                p95: pick((r) => r.frameMs.p95),
                p99: pick((r) => r.frameMs.p99),
            },
            fps,
            drawCalls: pick((r) => r.drawCalls),
            memoryBytes: pick((r) => r.memoryBytes),
            memoryKind: reps[0]?.memoryKind ?? 'exact',
            samples: {
                frames: reps.reduce((n, r) => n + r.samples.frames, 0),
                gpu: reps.reduce((n, r) => n + r.samples.gpu, 0),
            },
            vsyncLimited: isVsyncLimited(fps),
        },
        cv,
        unstable: cv > UNSTABLE_CV,
    };
}
