import { describe, expect, it } from 'vitest';
import { ColorGrading } from '../effects/ColorGrading';

const params = (e: ColorGrading): number[] => Array.from(new Float32Array(e.paramsBytes().buffer));

describe('ColorGrading — vocabulário de domínio', () => {
    it('padrões formam a identidade: strength 1, lift 0, gain 1, gamma 1', () => {
        expect(params(new ColorGrading())).toEqual([1, 0, 1, 1]);
    });

    it('lift, gain, gamma e strength vão para (strength, lift, gain, gamma)', () => {
        const p = params(new ColorGrading({ strength: 0.5, lift: 0.1, gain: 1.2, gamma: 2.2 }));
        expect(p[0]).toBeCloseTo(0.5);
        expect(p[1]).toBeCloseTo(0.1);
        expect(p[2]).toBeCloseTo(1.2);
        expect(p[3]).toBeCloseTo(2.2);
    });

    it('enabled repassado', () => {
        expect(new ColorGrading({ enabled: false }).isEnabled).toBe(false);
    });
});
