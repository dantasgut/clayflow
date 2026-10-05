import { describe, expect, it } from 'vitest';
import {
    aggregateRepetitions,
    coefficientOfVariation,
    isVsyncLimited,
    mean,
    median,
    MIN_GPU_SAMPLES,
    percentile,
    summarizeRepetition,
} from '../stats';
import type { Metrics, RepetitionSamples } from '../types';

function samples(over: Partial<RepetitionSamples> = {}): RepetitionSamples {
    return {
        frameMs: [10, 10, 10, 10],
        cpuMs: [2, 3, 4],
        gpuMs: Array.from({ length: MIN_GPU_SAMPLES }, () => 1.5),
        drawCalls: [100, 100, 101],
        memoryBytes: 1024,
        memoryKind: 'exact',
        ...over,
    };
}

describe('estatística básica', () => {
    it('mean, median, percentil com interpolação linear', () => {
        expect(mean([1, 2, 3, 4])).toBe(2.5);
        expect(mean([])).toBe(0);
        expect(median([5, 1, 3])).toBe(3);
        expect(median([1, 2, 3, 4])).toBe(2.5);
        expect(percentile([0, 10], 95)).toBeCloseTo(9.5, 9);
        expect(percentile([1, 2, 3, 4, 5], 100)).toBe(5);
        expect(percentile([1, 2, 3, 4, 5], 0)).toBe(1);
        expect(percentile([], 50)).toBeNaN();
    });

    it('coeficiente de variação', () => {
        expect(coefficientOfVariation([10])).toBe(0);
        expect(coefficientOfVariation([10, 10, 10])).toBe(0);
        expect(coefficientOfVariation([9, 11])).toBeCloseTo(Math.SQRT2 / 10, 9);
        expect(coefficientOfVariation([0, 0])).toBe(0);
    });

    it('vsync: ±2% de 60/120/144', () => {
        expect(isVsyncLimited(59.5)).toBe(true);
        expect(isVsyncLimited(143)).toBe(true);
        expect(isVsyncLimited(90)).toBe(false);
        expect(isVsyncLimited(500)).toBe(false);
    });
});

describe('summarizeRepetition', () => {
    it('resume as amostras de uma repetição', () => {
        const m = summarizeRepetition(samples());
        expect(m.cpuMs).toBe(3);
        expect(m.gpuMs).toBe(1.5);
        expect(m.frameMs.mean).toBe(10);
        expect(m.fps).toBe(100);
        expect(m.drawCalls).toBe(100);
        expect(m.samples).toEqual({ frames: 4, gpu: MIN_GPU_SAMPLES });
        expect(m.vsyncLimited).toBe(false);
    });

    it('gpuMs null com menos de 30 leituras', () => {
        expect(summarizeRepetition(samples({ gpuMs: [1, 2] })).gpuMs).toBeNull();
    });

    it('marca vsync quando o FPS fica em 60', () => {
        const m = summarizeRepetition(samples({ frameMs: [16.67, 16.66, 16.67] }));
        expect(m.vsyncLimited).toBe(true);
    });
});

describe('aggregateRepetitions', () => {
    const rep = (frame: number, cpu: number, gpu: number | null): Metrics => ({
        ...summarizeRepetition(samples({ frameMs: [frame], cpuMs: [cpu] })),
        gpuMs: gpu,
    });

    it('mediana das medianas e soma de amostras', () => {
        const a = aggregateRepetitions([rep(10, 2, 1), rep(10.2, 4, 3), rep(10.1, 3, 2)]);
        expect(a.metrics.cpuMs).toBe(3);
        expect(a.metrics.gpuMs).toBe(2);
        expect(a.metrics.frameMs.mean).toBe(10.1);
        expect(a.metrics.samples.frames).toBe(3);
        expect(a.unstable).toBe(false);
    });

    it('gpuMs usa só repetições com leitura; null se nenhuma', () => {
        expect(aggregateRepetitions([rep(10, 1, null), rep(10, 1, 4)]).metrics.gpuMs).toBe(4);
        expect(aggregateRepetitions([rep(10, 1, null)]).metrics.gpuMs).toBeNull();
    });

    it('instável quando o CV do tempo de quadro passa de 5%', () => {
        const a = aggregateRepetitions([rep(10, 1, 1), rep(14, 1, 1), rep(8, 1, 1)]);
        expect(a.cv).toBeGreaterThan(0.05);
        expect(a.unstable).toBe(true);
    });

    it('lança sem repetições', () => {
        expect(() => aggregateRepetitions([])).toThrow();
    });
});
