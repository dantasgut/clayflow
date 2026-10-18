import { describe, expect, it } from 'vitest';
import { GpuFrameSamples, median } from '../../__smokes__/support/gpuSamples';

describe('GpuFrameSamples — leituras de GPU dos smokes (spec 034, H1)', () => {
    it('cada quadro medido entra uma vez; sem leitura e aquecimento ficam de fora', () => {
        const s = new GpuFrameSamples();
        s.restartAfter(10);
        const base = { drawCalls: 1, dispatches: 0, passes: 1 };
        s.add(base);
        s.add({ ...base, gpuTimeMs: 9, gpuFrame: 9 });
        s.add({ ...base, gpuTimeMs: 2, gpuFrame: 12, stagesNs: { a: 1e6 } });
        s.add({ ...base, gpuTimeMs: 2, gpuFrame: 12, stagesNs: { a: 1e6 } });
        s.add({ ...base, gpuTimeMs: 1, gpuFrame: 11, stagesNs: { a: 3e6 } });
        expect(s.count).toBe(2);
        expect(s.times).toEqual([1, 2]);
        expect(s.stages().get('a')).toEqual([1e6, 3e6]);
    });

    it('mediana', () => {
        expect(median([])).toBe(0);
        expect(median([3, 1, 2])).toBe(2);
        expect(median([4, 1, 3, 2])).toBe(2.5);
    });
});
