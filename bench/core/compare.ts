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
            if (deltaPct > tolerance * 100) regressions.push(item);
            else if (deltaPct < -tolerance * 100) improvements.push(item);
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
