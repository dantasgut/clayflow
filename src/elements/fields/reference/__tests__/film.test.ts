import { describe, expect, it } from 'vitest';
import { FILM_IOR, filmPressure, filmSample, filmWeights, refract, wetNormal } from '../film';

describe('película: leitura, pressão e a normal da refração (spec 034, T066d)', () => {
    it('a B-spline quadrática soma 1 e lê a constante exata', () => {
        for (const f of [-0.5, -0.31, 0, 0.2, 0.499]) {
            const w = filmWeights(f);
            expect(w[0] + w[1] + w[2]).toBeCloseTo(1, 12);
        }
        const r = filmSample(() => 2e-4, 3.37, -1.81);
        expect(r.value).toBeCloseTo(2e-4, 15);
        expect(r.slope[0]).toBeCloseTo(0, 15);
        expect(r.slope[1]).toBeCloseTo(0, 15);
    });

    it('a leitura é contínua até a derivada através do centro das células (sem o vinco da bilinear)', () => {
        const grid = (i: number, j: number): number => (i >= 0 && j === 0 ? 1e-4 : 0);
        for (const u of [0.5, 1.0, 1.5, 2.0]) {
            const a = filmSample(grid, u - 1e-7, 0.5);
            const b = filmSample(grid, u + 1e-7, 0.5);
            expect(Math.abs(a.value - b.value)).toBeLessThan(1e-10);
            expect(Math.abs(a.slope[0] - b.slope[0])).toBeLessThan(1e-9);
        }
    });

    it('a pressão: o peso da coluna e a de Laplace, a seca sem fluxo pela borda', () => {
        // Película plana de 0,1 mm cercada de seca: só o peso (a borda não puxa).
        expect(
            filmPressure(1e-4, [undefined, undefined, undefined, undefined], 9.81, 7.2e-5, 0.00625),
        ).toBeCloseTo(9.81e-4, 12);
        // O pico mais alto que as vizinhas empurra para fora: a pressão de Laplace soma.
        const peak = filmPressure(2e-4, [1e-4, 1e-4, 1e-4, 1e-4], 0, 7.2e-5, 0.00625);
        expect(peak).toBeCloseTo((7.2e-5 * 4e-4) / 0.00625 ** 2, 12);
    });

    it('a normal inclinada desvia como a cunha de água sobre o vidro, na primeira ordem', () => {
        const n = [0, 0, 1] as const;
        const d = [0, 0, -1] as const;
        const glass = 1.5;
        for (const slope of [0.005, 0.02]) {
            // A cunha: a face de fora da água (n − ∇h), depois o vidro plano.
            const outer = [-slope, 0, 1].map((x) => x / Math.hypot(slope, 1)) as [
                number,
                number,
                number,
            ];
            const inWater = refract(d, outer, 1 / FILM_IOR)!;
            const inGlass = refract(inWater, n, FILM_IOR / glass)!;
            // O modelo: a interface do vidro com a normal inclinada.
            const tilted = wetNormal(n, n, [slope, 0, 0], glass);
            const model = refract(d, tilted, 1 / glass)!;
            const angle = (v: readonly number[]): number => Math.atan2(v[0]!, -v[2]!);
            expect(Math.abs(angle(model) / angle(inGlass) - 1)).toBeLessThan(0.01);
        }
        // Película plana: nada muda.
        expect(wetNormal(n, n, [0, 0, 0], glass)).toEqual([0, 0, 1]);
    });
});
