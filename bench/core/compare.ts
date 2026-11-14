import { median } from './stats';
import type {
    BaselineFile,
    GateMetric,
    Metrics,
    RegressionItem,
    RegressionReport,
    Result,
    RunFile,
} from './types';

const TIME_METRICS: readonly [GateMetric, (m: Metrics) => number | null][] = [
    ['cpuMs', (m) => m.cpuMs],
    ['gpuMs', (m) => m.gpuMs],
    ['frameMs.p95', (m) => m.frameMs.p95],
    ['frameMs.p99', (m) => m.frameMs.p99],
];

/**
 * Métricas do agendamento — o tempo de CPU do quadro e a cauda do intervalo entre quadros: dependem de quando o
 * navegador e o sistema dão a vez ao quadro, não só do trabalho do motor (no Mac, com o mesmo código, o p95 de
 * `rigid-bodies/1k` foi de 2,72 a 4,36 ms entre as cinco repetições do baseline, e o tempo de CPU de 0,14 ms muda
 * 0,02 ms). Para elas, a piora só conta se, além da tolerância, passa do ruído medido entre as repetições do
 * próprio baseline (`NOISE_MADS` × o desvio absoluto mediano). Sem repetições no baseline, só a tolerância (a
 * degradação de +15 % é sempre detectada, SC-003). O tempo de GPU fica só na tolerância.
 */
const SCHEDULING_METRICS: ReadonlySet<GateMetric> = new Set([
    'cpuMs',
    'frameMs.p95',
    'frameMs.p99',
]);
/** Desvios absolutos medianos que a piora de uma métrica do agendamento precisa passar (~2σ numa normal). */
export const NOISE_MADS = 3;

/** O ruído de uma métrica entre as repetições do baseline: `NOISE_MADS` × o desvio absoluto mediano (0 com < 3). */
export function repetitionNoise(base: Result, pick: (m: Metrics) => number | null): number {
    const values = (base.repetitions ?? [])
        .map(pick)
        .filter((v): v is number => v !== null && Number.isFinite(v));
    if (values.length < 3) return 0;
    const m = median(values);
    return NOISE_MADS * median(values.map((v) => Math.abs(v - m)));
}

const key = (r: Pick<Result, 'scene' | 'variant'>): string => `${r.scene}\u0000${r.variant}`;
const isBroken = (s: Result['status']): boolean => s === 'failed' || s === 'timeout';

/**
 * Compara a execução atual com o baseline do mesmo perfil (data-model "Regras de comparação"):
 * métricas de tempo do clayflow pioradas além da tolerância reprovam; `ok → failed/timeout` é
 * regressão; `failed/timeout → ok` é melhoria; `unsupported ↔ unsupported` é ignorado; métrica
 * `null` em um lado vira `skipped`. Resultados do Three nunca são avaliados (FR-013).
 */
export function compare(
    baseline: BaselineFile,
    current: RunFile,
    tolerance: number,
): RegressionReport {
    const regressions: RegressionItem[] = [];
    const improvements: RegressionItem[] = [];
    const skipped: RegressionItem[] = [];
    const now = new Map(
        current.results.filter((r) => r.engine === 'clayflow').map((r) => [key(r), r]),
    );

    for (const base of baseline.results) {
        if (base.engine !== 'clayflow') continue;
        const cur = now.get(key(base));
        const id = { scene: base.scene, variant: base.variant };
        if (cur === undefined) {
            skipped.push({
                ...id,
                metric: 'status',
                baseline: base.status,
                current: '—',
                deltaPct: null,
                note: 'sem correspondência na execução atual',
            });
            continue;
        }
        if (base.status === 'unsupported' && cur.status === 'unsupported') continue;
        if (base.status === 'ok' && isBroken(cur.status)) {
            regressions.push({
                ...id,
                metric: 'status',
                baseline: 'ok',
                current: cur.status,
                deltaPct: null,
            });
            continue;
        }
        if (isBroken(base.status) && cur.status === 'ok') {
            improvements.push({
                ...id,
                metric: 'status',
                baseline: base.status,
                current: 'ok',
                deltaPct: null,
            });
            continue;
        }
        if (
            base.status !== 'ok'
            || cur.status !== 'ok'
            || base.metrics === undefined
            || cur.metrics === undefined
        ) {
            if (base.status !== cur.status) {
                skipped.push({
                    ...id,
                    metric: 'status',
                    baseline: base.status,
                    current: cur.status,
                    deltaPct: null,
                    note: 'transição de estado sem comparação de métricas',
                });
            }
            continue;
        }
        for (const [metric, pick] of TIME_METRICS) {
            const b = pick(base.metrics);
            const c = pick(cur.metrics);
            if (b === null || c === null) {
                skipped.push({
                    ...id,
                    metric,
                    baseline: b ?? 'n/d',
                    current: c ?? 'n/d',
                    deltaPct: null,
                    note: `indisponível ${b === null ? 'no baseline' : 'na execução atual'}`,
                });
                continue;
            }
            if (b <= 0) continue;
            const deltaPct = ((c - b) / b) * 100;
            const item = { ...id, metric, baseline: b, current: c, deltaPct };
            if (deltaPct > tolerance * 100) {
                const noise = SCHEDULING_METRICS.has(metric) ? repetitionNoise(base, pick) : 0;
                if (c - b > noise) regressions.push(item);
                else
                    skipped.push({
                        ...item,
                        note: `dentro do ruído entre as repetições do baseline (±${noise.toFixed(3)} ms)`,
                    });
            } else if (deltaPct < -tolerance * 100) improvements.push(item);
        }
    }
    return {
        profileId: baseline.profileId,
        baselineCommit: baseline.commit,
        tolerance,
        regressions,
        improvements,
        skipped,
        passed: regressions.length === 0,
    };
}
