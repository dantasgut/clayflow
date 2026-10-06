import { describe, expect, it } from 'vitest';
import { toBaseline } from '../baseline';
import { compare } from '../compare';
import type { Metrics, Result } from '../types';
import { metrics, okResult, runFile } from './fixtures';

const TIME_METRICS = ['cpuMs', 'gpuMs', 'frameMs.p95', 'frameMs.p99'] as const;

function scale(m: Metrics, metric: (typeof TIME_METRICS)[number], factor: number): Metrics {
    switch (metric) {
        case 'cpuMs':
            return { ...m, cpuMs: m.cpuMs * factor };
        case 'gpuMs':
            return { ...m, gpuMs: (m.gpuMs ?? 0) * factor };
        case 'frameMs.p95':
            return { ...m, frameMs: { ...m.frameMs, p95: m.frameMs.p95 * factor } };
        case 'frameMs.p99':
            return { ...m, frameMs: { ...m.frameMs, p99: m.frameMs.p99 * factor } };
    }
}

const base = (results: Result[]) => toBaseline(runFile(results), 0.1);
const withMetrics = (m: Metrics): Result => ({
    scene: 's',
    variant: 'v',
    engine: 'clayflow',
    status: 'ok',
    metrics: m,
});

describe('compare — gate de regressão', () => {
    it('degradação sintética de +15% detectada em 100% dos casos (SC-003)', () => {
        const seeds = [
            metrics(),
            metrics({ cpuMs: 0.37, gpuMs: 12.4, frameMs: { mean: 3, p95: 4.1, p99: 9.9 } }),
            metrics({ cpuMs: 120, gpuMs: 0.05, frameMs: { mean: 200, p95: 250, p99: 300 } }),
        ];
        let detected = 0;
        let total = 0;
        for (const m of seeds) {
            for (const metric of TIME_METRICS) {
                total++;
                const report = compare(
                    base([withMetrics(m)]),
                    runFile([withMetrics(scale(m, metric, 1.15))]),
                    0.1,
                );
                if (!report.passed && report.regressions.some((r) => r.metric === metric))
                    detected++;
            }
        }
        expect(detected).toBe(total);
    });

    it('execução idêntica passa (SC-003)', () => {
        const r = [okResult('s', 'v', 'clayflow')];
        const report = compare(base(r), runFile(r), 0.1);
        expect(report.passed).toBe(true);
        expect(report.regressions).toEqual([]);
        expect(report.improvements).toEqual([]);
    });

    it('+9% passa; −12% vira melhoria', () => {
        const m = metrics();
        expect(
            compare(base([withMetrics(m)]), runFile([withMetrics(scale(m, 'cpuMs', 1.09))]), 0.1)
                .passed,
        ).toBe(true);
        const better = compare(
            base([withMetrics(m)]),
            runFile([withMetrics(scale(m, 'gpuMs', 0.88))]),
            0.1,
        );
        expect(better.passed).toBe(true);
        expect(better.improvements).toHaveLength(1);
        expect(better.improvements[0]).toMatchObject({ metric: 'gpuMs' });
        expect(better.improvements[0]?.deltaPct).toBeCloseTo(-12, 6);
    });

    it('transições de estado', () => {
        const ok = okResult('s', 'v', 'clayflow');
        const timeout: Result = {
            scene: 's',
            variant: 'v',
            engine: 'clayflow',
            status: 'timeout',
            reason: 'x',
        };
        const failed: Result = { ...timeout, status: 'failed' };
        const unsupported: Result = {
            scene: 's',
            variant: 'v',
            engine: 'clayflow',
            status: 'unsupported',
            reason: 'y',
        };
        expect(compare(base([ok]), runFile([timeout]), 0.1).regressions[0]).toMatchObject({
            metric: 'status',
            current: 'timeout',
        });
        expect(compare(base([ok]), runFile([failed]), 0.1).passed).toBe(false);
        const back = compare(base([failed]), runFile([ok]), 0.1);
        expect(back.passed).toBe(true);
        expect(back.improvements[0]).toMatchObject({ metric: 'status', current: 'ok' });
        const same = compare(base([unsupported]), runFile([unsupported]), 0.1);
        expect([same.regressions, same.improvements, same.skipped]).toEqual([[], [], []]);
    });

    it('métrica null em um lado vira skipped, nunca regressão', () => {
        const m = metrics();
        const report = compare(
            base([withMetrics({ ...m, gpuMs: null })]),
            runFile([withMetrics({ ...m, gpuMs: 99 })]),
            0.1,
        );
        expect(report.passed).toBe(true);
        expect(report.skipped[0]).toMatchObject({
            metric: 'gpuMs',
            note: 'indisponível no baseline',
        });
    });

    it('resultados do Three nunca reprovam (FR-013)', () => {
        const report = compare(
            base([okResult('s', 'v', 'clayflow')]),
            runFile([okResult('s', 'v', 'clayflow'), okResult('s', 'v', 'three', { cpuMs: 999 })]),
            0.1,
        );
        expect(report.passed).toBe(true);
    });

    it('tolerância customizada', () => {
        const m = metrics();
        const cur = runFile([withMetrics(scale(m, 'cpuMs', 1.15))]);
        expect(compare(base([withMetrics(m)]), cur, 0.2).passed).toBe(true);
        expect(compare(base([withMetrics(m)]), cur, 0.05).passed).toBe(false);
    });

    it('linha do baseline sem correspondência vira skipped', () => {
        const report = compare(base([okResult('gone', 'v', 'clayflow')]), runFile([]), 0.1);
        expect(report.skipped[0]).toMatchObject({
            scene: 'gone',
            note: 'sem correspondência na execução atual',
        });
    });
});
