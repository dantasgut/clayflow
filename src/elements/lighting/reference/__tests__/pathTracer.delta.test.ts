import { describe, expect, it } from 'vitest';
import {
    deltaRng,
    deltaTrackRadiance,
    henyeyGreenstein,
    ratioTrackTransmittance,
    tabulatePhase,
    type PtDeltaMedium,
    type PtDeltaScene,
    type Vec3,
} from '../pathTracer';

// Rastreamento delta (spec 041, T006): meio homogêneo contra Beer–Lambert, espalhamento simples contra a integral
// fechada, energia conservada com albedo 1 (fornalha branca) e a fase arbitrária amostrada pela tabela.

/** Placa homogênea `0 ≤ y ≤ H` (km de espessura em metros), infinita no plano. */
function slab(
    sigma: number,
    thickness: number,
    albedo: number,
    phase = tabulatePhase(() => 1 / (4 * Math.PI)),
): PtDeltaMedium {
    return {
        majorant: sigma * 1.7, // majorante folgado: os eventos nulos não podem enviesar
        extinction: (p) => (p[1] >= 0 && p[1] <= thickness ? sigma : 0),
        albedo,
        phase,
        spans: (o, d, tMax) => {
            if (Math.abs(d[1]) < 1e-12) return o[1] >= 0 && o[1] <= thickness ? [[0, tMax]] : [];
            const t0 = (0 - o[1]) / d[1];
            const t1 = (thickness - o[1]) / d[1];
            const a = Math.max(0, Math.min(t0, t1));
            const b = Math.min(tMax, Math.max(t0, t1));
            return b > a ? [[a, b]] : [];
        },
    };
}

const mean = (n: number, f: (k: number) => number): number => {
    let s = 0;
    for (let k = 0; k < n; k++) s += f(k);
    return s / n;
};

describe('rastreamento delta', () => {
    it('transmitância por razão = Beer–Lambert num meio homogêneo de quilômetros', () => {
        // Arrange
        const m = slab(0.002, 1000, 0.9);
        const d: Vec3 = [0, Math.SQRT1_2, Math.SQRT1_2];
        // Act
        const T = mean(4000, (k) =>
            ratioTrackTransmittance(m, [0, -10, 0], d, Infinity, deltaRng(1, k)),
        );
        // Assert
        expect(T).toBeCloseTo(Math.exp(-0.002 * 1000 * Math.SQRT2), 2);
    });

    it('espalhamento simples (uma colisão) = a integral fechada σs·p·E·H·e^(−σH)', () => {
        const sigma = 0.001;
        const depth = 1000;
        const scene: PtDeltaScene = {
            medium: slab(sigma, depth, 0.8),
            sunDir: [0, 1, 0],
            sun: [1, 1, 1],
            sky: () => [0, 0, 0],
        };
        const L = mean(
            20000,
            (k) => deltaTrackRadiance(scene, [0, -1, 0], [0, 1, 0], deltaRng(2, k), 0)[0],
        );
        const exact = ((0.8 * sigma) / (4 * Math.PI)) * depth * Math.exp(-sigma * depth);
        expect(Math.abs(L / exact - 1)).toBeLessThan(0.03);
    });

    it('fornalha branca: albedo 1 sob céu uniforme devolve o céu (energia conservada)', () => {
        const scene: PtDeltaScene = {
            medium: slab(
                0.004,
                1000,
                1,
                tabulatePhase((c) => henyeyGreenstein(c, 0.85)),
            ),
            sunDir: [0, 1, 0],
            sun: [0, 0, 0],
            sky: () => [1, 1, 1],
        };
        const L = mean(
            1500,
            (k) => deltaTrackRadiance(scene, [0, 500, 0], [1, 0, 0], deltaRng(3, k), 2000)[0],
        );
        expect(L).toBeGreaterThan(0.97);
        expect(L).toBeLessThan(1.03);
    });

    it('a fase tabelada amostra a média do cosseno da HG (g)', () => {
        const p = tabulatePhase((c) => henyeyGreenstein(c, 0.9));
        const g = mean(200000, (k) => p.sampleCos((k + 0.5) / 200000));
        expect(g).toBeCloseTo(0.9, 3);
    });
});
