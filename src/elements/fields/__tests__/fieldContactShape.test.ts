/**
 * Spec 034: a forma da gota pousada num sólido no campo dos fluidos — a calota do ângulo de contato com o volume do
 * núcleo esparso.
 */
import { describe, expect, it } from 'vitest';
import { fieldContactShape } from '../schemas';

describe('fieldContactShape — a gota que molha (spec 034)', () => {
    it('sem molhar (θ ≥ 90°) não há calota', () => {
        expect(fieldContactShape(90)).toEqual([0, 0]);
        expect(fieldContactShape(150)).toEqual([0, 0]);
    });

    it('com θ < 90°: o volume do núcleo (a² c = 1) e a razão altura/raio da calota, tan(θ/2)', () => {
        for (const theta of [30, 45, 60, 80]) {
            const [a, c] = fieldContactShape(theta);
            expect(a * a * c).toBeCloseTo(1, 12);
            expect(c / a).toBeCloseTo(Math.tan((theta * Math.PI) / 360), 12);
        }
    });

    it('o raio lateral fica no alcance do núcleo (2 frações), com o mesmo volume', () => {
        const [a, c] = fieldContactShape(2);
        expect(a).toBe(2);
        expect(a * a * c).toBeCloseTo(1, 12);
        expect(fieldContactShape(0)).toEqual([2, 0.25]);
    });
});
