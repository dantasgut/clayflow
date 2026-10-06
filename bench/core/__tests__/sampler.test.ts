import { describe, expect, it } from 'vitest';
import { FrameSampler } from '../../page/sampler';

function clock(): { now: () => number; advance: (ms: number) => void } {
    let t = 0;
    return {
        now: () => t,
        advance: (ms) => {
            t += ms;
        },
    };
}

describe('FrameSampler', () => {
    it('descarta o aquecimento e respeita a janela', () => {
        const c = clock();
        const s = new FrameSampler({
            warmupMs: 100,
            windowMs: 50,
            timeoutMs: 10_000,
            warmupFrames: 1,
            now: c.now,
        });
        s.start();
        const phases: string[] = [];
        for (let i = 0; i < 20; i++) {
            c.advance(10);
            phases.push(s.record({ cpuMs: i, drawCalls: 1 }));
        }
        expect(phases.slice(0, 9).every((p) => p === 'warmup')).toBe(true);
        expect(phases[9]).toBe('measuring');
        expect(phases.indexOf('done')).toBe(14);
        const w = s.result();
        // quadros 11..15 medidos (5 intervalos de 10 ms), nenhum do aquecimento
        expect(w.frameMs.slice(0, 5)).toEqual([10, 10, 10, 10, 10]);
        expect(w.cpuMs[0]).toBe(10);
    });

    it('conta cada leitura de GPU uma vez só', () => {
        const c = clock();
        const s = new FrameSampler({
            warmupMs: 0,
            windowMs: 1000,
            timeoutMs: 10_000,
            warmupFrames: 1,
            now: c.now,
        });
        s.start();
        c.advance(1);
        s.record({ cpuMs: 1, drawCalls: 1, gpuMs: 9, gpuSampleId: 1 });
        for (const id of [1, 2, 2, 3, undefined]) {
            c.advance(1);
            s.record({
                cpuMs: 1,
                drawCalls: 1,
                ...(id !== undefined ? { gpuMs: id, gpuSampleId: id } : {}),
            });
        }
        expect(s.result().gpuMs).toEqual([2, 3]);
    });

    it('aquecimento exige também um mínimo de quadros', () => {
        const c = clock();
        const s = new FrameSampler({
            warmupMs: 10,
            windowMs: 1000,
            timeoutMs: 100_000,
            warmupFrames: 3,
            now: c.now,
        });
        s.start();
        c.advance(5000);
        expect(s.record({ cpuMs: 1, drawCalls: 0 })).toBe('warmup');
        c.advance(5000);
        expect(s.record({ cpuMs: 1, drawCalls: 0 })).toBe('warmup');
        c.advance(5000);
        expect(s.record({ cpuMs: 1, drawCalls: 0 })).toBe('measuring');
    });

    it('tempo esgotado dispara pelo relógio total', () => {
        const c = clock();
        const s = new FrameSampler({
            warmupMs: 10,
            windowMs: 1000,
            timeoutMs: 100,
            warmupFrames: 1,
            now: c.now,
        });
        s.start();
        c.advance(50);
        expect(s.record({ cpuMs: 1, drawCalls: 0 })).toBe('measuring');
        c.advance(60);
        expect(s.record({ cpuMs: 1, drawCalls: 0 })).toBe('timeout');
    });

    it('leitura de GPU tardia entra uma vez', () => {
        const c = clock();
        const s = new FrameSampler({
            warmupMs: 0,
            windowMs: 1,
            timeoutMs: 10_000,
            warmupFrames: 1,
            now: c.now,
        });
        s.start();
        c.advance(1);
        s.record({ cpuMs: 1, drawCalls: 1, gpuMs: 5, gpuSampleId: 7 });
        expect(s.lateGpuReading({ gpuMs: 5, id: 7 })).toBe(false);
        expect(s.lateGpuReading({ gpuMs: 6, id: 8 })).toBe(true);
        expect(s.lateGpuReading(undefined)).toBe(false);
        expect(s.result().gpuMs).toEqual([6]);
    });
});
