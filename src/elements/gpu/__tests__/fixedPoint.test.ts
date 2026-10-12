import { describe, expect, it } from 'vitest';
import {
    FIXED_LIMIT,
    fixedFromF32,
    fixedSaturated,
    fixedToF32,
    roundHalfEven,
} from '../../../__smokes__/support/fixedPointReference';

// Referência em CPU do módulo WGSL `fixed_point` (research R10). Os valores da GPU são comparados com ela no smoke
// `computeKernels`; aqui ficam as propriedades da própria referência.

const SCALE = 1048576; // 2^20, escala do LCP

describe('referência do ponto fixo', () => {
    it('arredonda ao mais próximo com empate para o par (round do WGSL)', () => {
        expect([0.5, 1.5, 2.5, -0.5, -1.5, 2.4, 2.6].map(roundHalfEven)).toEqual([
            0, 2, 2, -0, -2, 2, 3,
        ]);
    });

    it('ida e volta dentro da resolução 1/scale', () => {
        for (const x of [0, 1e-6, -3.25, 123.456789, -2047.5]) {
            expect(Math.abs(fixedToF32(fixedFromF32(x, SCALE), SCALE) - x)).toBeLessThanOrEqual(
                0.5 / SCALE + Math.abs(x) * 2 ** -23,
            );
        }
    });

    it('satura em ±(2³¹ − 128) e sinaliza a saturação', () => {
        expect(fixedFromF32(4096, SCALE)).toBe(FIXED_LIMIT);
        expect(fixedFromF32(-4096, SCALE)).toBe(-FIXED_LIMIT);
        expect(fixedSaturated(4096, SCALE)).toBe(true);
        expect(fixedSaturated(2047, SCALE)).toBe(false);
        expect(FIXED_LIMIT).toBe(2 ** 31 - 128);
        expect(Math.fround(FIXED_LIMIT)).toBe(FIXED_LIMIT);
    });

    it('soma em ponto fixo é exata e independente da ordem', () => {
        const values = Array.from({ length: 1000 }, (_, i) => Math.sin(i * 1.7) * 0.01);
        const forward = values.reduce((a, v) => a + fixedFromF32(v, SCALE), 0);
        const backward = [...values].reverse().reduce((a, v) => a + fixedFromF32(v, SCALE), 0);
        expect(forward).toBe(backward);
        const real = values.reduce((a, v) => a + v, 0);
        expect(Math.abs(fixedToF32(forward, SCALE) - real)).toBeLessThan(
            (values.length * 0.5) / SCALE,
        );
    });
});
