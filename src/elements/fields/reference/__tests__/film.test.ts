import { describe, expect, it } from 'vitest';
import {
    absorbUnits,
    FILM_IOR,
    filmBreaks,
    filmCoverage,
    filmPressure,
    filmSample,
    filmSiteBase,
    filmSiteMean,
    filmSiteWeight,
    filmSlopeCap,
    filmWeights,
    FILM_SITE_REACH,
    FILM_SITES,
    puddleThickness,
    refract,
    wetNormal,
} from '../film';

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

    it('junto à água do volume a película termina nela: sem a descida a zero da célula submersa', () => {
        // Película uniforme de 0,1 mm acima da linha d'água (j ≥ 0), submersa abaixo: a leitura é a película, plana.
        const grid = (_i: number, j: number): number => (j >= 0 ? 1e-4 : -1);
        for (const v of [0.5, 0.7, 1.0, 1.4]) {
            const r = filmSample(grid, 2.3, v);
            expect(r.value).toBeCloseTo(1e-4, 15);
            expect(Math.abs(r.slope[1])).toBeLessThan(1e-15);
        }
        // Na célula submersa, nenhuma película (é a própria água).
        expect(filmSample(grid, 2.3, -0.5).value).toBe(0);
        // Com a submersa contada como seca, a borda descia a zero: a inclinação de antes.
        const dry = (_i: number, j: number): number => (j >= 0 ? 1e-4 : 0);
        expect(Math.abs(filmSample(dry, 2.3, 0.6).slope[1])).toBeGreaterThan(3e-5);
    });

    it('o ângulo de contato limita a inclinação da película', () => {
        const cos = Math.cos((30 * Math.PI) / 180);
        const tan = Math.tan((30 * Math.PI) / 180);
        const capped = filmSlopeCap([1.2, -0.9], cos);
        expect(Math.hypot(...capped)).toBeCloseTo(tan, 12);
        expect(capped[0] / capped[1]).toBeCloseTo(1.2 / -0.9, 12);
        expect(filmSlopeCap([0.1, 0.2], cos)).toEqual([0.1, 0.2]);
        // θ ≥ 90°: sem limite.
        expect(filmSlopeCap([3, 0], 0)).toEqual([3, 0]);
    });

    it('as gotas dos sítios: a água se conserva na média e a película se rompe enquanto a maior cabe', () => {
        // A média dos pesos sobre u uniforme (o ponto médio em 10⁶ faixas) é a do modelo: o volume das gotas soma a água.
        const n = 1_000_000;
        let sum = 0;
        for (let k = 0; k < n; k++) sum += filmSiteWeight((k + 0.5) / n);
        expect(sum / n).toBeCloseTo(filmSiteMean(), 9);
        expect(filmSiteWeight(0.39)).toBe(0);
        // A gota do sítio: a calota do volume h s² · peso / média, até o alcance (metade do passo).
        const cell = 0.00625;
        const kappa = 0.0449;
        const s = cell / FILM_SITES;
        expect(filmSiteBase(1e-4, filmSiteMean(), kappa, cell)).toBeCloseTo(
            kappa * Math.cbrt(1e-4),
            12,
        );
        expect(filmSiteBase(1e-3, 1, kappa, cell)).toBe(FILM_SITE_REACH * s);
        // A ruptura: abaixo da espessura crítica, na molhagem parcial.
        expect(filmBreaks(1e-4, kappa, 1.4e-3)).toBe(true);
        expect(filmBreaks(2e-3, kappa, 1.4e-3)).toBe(false);
        expect(filmBreaks(1e-4, 0, 1.4e-3)).toBe(false);
    });

    it('a pressão: o peso da coluna e a de Laplace, a seca sem fluxo pela borda', () => {
        // Película plana de 0,1 mm cercada de seca: só o peso (a borda não puxa).
        expect(
            filmPressure(1e-4, Array<undefined>(8).fill(undefined), 9.81, 7.2e-5, 0.00625),
        ).toBeCloseTo(9.81e-4, 12);
        // O pico mais alto que as vizinhas empurra para fora: a pressão de Laplace soma (os pesos somam 10/3).
        const peak = filmPressure(2e-4, Array<number>(8).fill(1e-4), 0, 7.2e-5, 0.00625);
        expect(peak).toBeCloseTo((7.2e-5 * (10 / 3) * 1e-4) / 0.00625 ** 2, 12);
        // O laplaciano isotrópico: o paraboloide h = x² + y² dá 4 com qualquer rotação da grade.
        for (const a of [0, 0.3, Math.PI / 4]) {
            const f = (x: number, y: number): number => {
                const u = Math.cos(a) * x - Math.sin(a) * y;
                const v = Math.sin(a) * x + Math.cos(a) * y;
                return u * u + 0.5 * v * v;
            };
            const at = [
                [-1, 0],
                [1, 0],
                [0, -1],
                [0, 1],
                [-1, -1],
                [1, -1],
                [-1, 1],
                [1, 1],
            ].map(([x, y]) => f(x!, y!));
            expect(-filmPressure(f(0, 0), at, 0, 1, 1)).toBeCloseTo(3, 12);
        }
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

    it('a cobertura do disco: a borda redonda pela leitura das células (sem o quadrado das inteiras)', () => {
        const cell = 1;
        const radius = 2;
        expect(filmCoverage(0, radius, cell)).toBe(1);
        expect(filmCoverage(radius, radius, cell)).toBe(0.5);
        expect(filmCoverage(radius + 0.5, radius, cell)).toBe(0);
        // A residual pesada pela cobertura, lida pela B-spline: a meia espessura (o contorno da mancha) a menos de 10 %
        // do raio em todas as direções, com o contato fora do centro da célula — com as células inteiras, 33 %.
        const cx = 0.3;
        const cy = 0.21;
        const disc =
            (cover: (d: number) => number) =>
            (i: number, j: number): number =>
                cover(Math.hypot(i + 0.5 - cx, j + 0.5 - cy));
        const contour = (h: (i: number, j: number) => number, angle: number): number => {
            let lo = 0;
            let hi = 6;
            for (let k = 0; k < 60; k++) {
                const m = 0.5 * (lo + hi);
                const v = filmSample(h, cx + m * Math.cos(angle), cy + m * Math.sin(angle)).value;
                if (v > 0.5) lo = m;
                else hi = m;
            }
            return lo;
        };
        const angles = Array.from({ length: 64 }, (_, k) => (k * Math.PI) / 32);
        const round = angles.map((a) =>
            contour(
                disc((d) => filmCoverage(d, radius, cell)),
                a,
            ),
        );
        const square = angles.map((a) =>
            contour(
                disc((d) => (d <= radius ? 1 : 0)),
                a,
            ),
        );
        const spread = (r: number[]): number => (Math.max(...r) - Math.min(...r)) / radius;
        expect(spread(round)).toBeLessThan(0.1);
        expect(spread(square)).toBeGreaterThan(0.3);
    });

    it('a poça da gota: a altura que a borda segura, a película mais grossa na parede', () => {
        // f/ρ = 1e-4 m³/s² no chão: √(2 · 1e-4 / 9,81) = 4,5 mm.
        expect(puddleThickness(1e-4, 9.81, 0.01)).toBeCloseTo(Math.sqrt(2e-4 / 9.81), 12);
        expect(puddleThickness(1e-4, 0, 0.01)).toBe(0.01);
        expect(puddleThickness(1e-2, 9.81, 0.01)).toBe(0.01);
    });

    it('a gota passada à película: as unidades repartidas sem perder nem criar nenhuma', () => {
        const weights = [0, 0.25, 1, 1, 0.5, 0.75, 1, 0.1];
        for (const units of [0, 1, 7, 39_062_500, 4_000_000_000]) {
            const out = absorbUnits(units, weights, 2);
            expect(out.reduce((a, k) => a + k, 0)).toBe(units);
            expect(out[0]).toBe(0);
            for (const k of out) expect(Number.isInteger(k) && k >= 0).toBe(true);
        }
        // Sem célula sobre o sólido além da do contato: tudo nela.
        expect(absorbUnits(5, [0, 0, 0], 1)).toEqual([0, 5, 0]);
    });
});
