import { describe, expect, it } from 'vitest';
import {
    temporalMeanVariance,
    temporalMoments,
    temporalValidatePlane,
    temporalVariance,
    temporalWeightChange,
    temporalWeightCount,
} from '../temporal';

// Peças temporais (spec 037, R5): as propriedades das contas que os acumuladores compõem.

describe('peças temporais', () => {
    it('peso por contagem: a média exata dos quadros até o teto', () => {
        // Acumular x_k com 1/(k + 1) dá a média dos k + 1 primeiros.
        const xs = [3, 1, 4, 1, 5, 9, 2, 6];
        let mean = xs[0]!;
        for (let k = 1; k < xs.length; k++) {
            const w = temporalWeightCount(k, 1000);
            mean = mean * (1 - w) + xs[k]! * w;
        }
        expect(mean).toBeCloseTo(xs.reduce((s, x) => s + x, 0) / xs.length, 12);
        // No teto, o peso para de cair (média móvel exponencial).
        expect(temporalWeightCount(500, 32)).toBe(1 / 32);
    });

    it('α do A-SVGF: sem mudança o peso por contagem, com mudança total 1', () => {
        expect(temporalWeightChange(0.1, 0)).toBe(0.1);
        expect(temporalWeightChange(0.1, 1)).toBe(1);
        expect(temporalWeightChange(0.1, 0.5)).toBeCloseTo(0.55, 12);
    });

    it('momentos e variância: a variância de uma sequência constante é zero; a de ±1 é 1', () => {
        let m: [number, number] = [0, 0];
        for (let k = 0; k < 64; k++) m = temporalMoments(m, 2, temporalWeightCount(k, 1000), 0);
        expect(temporalVariance(m)).toBeCloseTo(0, 10);
        m = [0, 0];
        for (let k = 0; k < 64; k++)
            m = temporalMoments(m, k % 2 === 0 ? 1 : -1, temporalWeightCount(k, 1000), 0);
        expect(temporalVariance(m)).toBeCloseTo(1, 10);
        // O mínimo do peso nos momentos vale mesmo com o α pequeno.
        expect(temporalMoments([0, 0], 1, 0.01, 0.2)).toEqual([0.2, 0.2]);
    });

    it('variância da média: dividida pelos quadros, ampliada por 4/quadros abaixo de 4', () => {
        expect(temporalMeanVariance(1, 8)).toBe(1 / 8);
        expect(temporalMeanVariance(1, 2)).toBe(1);
        expect(temporalMeanVariance(1, 1)).toBe(4);
    });

    it('validação por plano e normal', () => {
        const n = [0, 1, 0];
        expect(temporalValidatePlane([0, 0, 0], n, [0, 0, 0], n, 0.1, 0.95)).toBe(1);
        expect(temporalValidatePlane([0, 0, 0], n, [0, 0.05, 0], n, 0.1, 0.95)).toBeCloseTo(
            0.5,
            12,
        );
        expect(temporalValidatePlane([0, 0, 0], n, [0, 0.2, 0], n, 0.1, 0.95)).toBe(0);
        expect(temporalValidatePlane([0, 0, 0], [1, 0, 0], [0, 0, 0], n, 0.1, 0.95)).toBe(0);
    });
});
