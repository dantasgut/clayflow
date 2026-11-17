import { describe, expect, it } from 'vitest';
import { cloudPhaseTruncation } from '../../CloudLayer';
import { jdeParams, jdePhase, type Vec3 } from '../cloudModel';
import {
    phaseTruncation,
    sampleTruncatedCos,
    scatterGridCoords,
    scatterProbePosition,
    truncatedPhase,
    type ScatterGrid,
} from '../cloudScatter';
import { calibrationCloud } from '../calibrationScene';
import { deltaRng } from '../../../../lighting/reference/pathTracer';

// O cache de espalhamento (spec 041, T023, R8): a truncagem da fase (δ-M), a amostragem da fase truncada e a grade das
// sondas, contra as integrais e as inversas fechadas.

describe('truncagem da fase (δ-M)', () => {
    it('a fração do núcleo é a integral da fase no cone; a fase truncada fecha 1 fora dele', () => {
        // Arrange
        const p = jdeParams(20);
        const t = phaseTruncation(p);
        // Act: as integrais da fase completa no cone e da truncada na esfera (grade quadrática perto da frente).
        let core = 0;
        let rest = 0;
        const n = 400_000;
        for (let i = 0; i < n; i++) {
            const c0 = 1 - 2 * (i / n) ** 2;
            const c1 = 1 - 2 * ((i + 1) / n) ** 2;
            const c = 0.5 * (c0 + c1);
            const w = (c0 - c1) * 2 * Math.PI;
            if (c > t.cosCut) core += jdePhase(c, p) * w;
            rest += truncatedPhase(c, p, t) * w;
        }
        // Assert
        expect(t.fc).toBeCloseTo(core, 3);
        expect(rest).toBeCloseTo(1, 3);
        expect(t.fc).toBeGreaterThan(0.4);
        expect(t.fc).toBeLessThan(0.45);
    });

    it('o empacotamento da camada é o mesmo da referência', () => {
        // Arrange
        for (const d of [5, 12, 20, 35, 50]) {
            const t = phaseTruncation(jdeParams(d));
            // Act
            const packed = cloudPhaseTruncation(d);
            // Assert
            expect(packed[0]).toBeCloseTo(t.cosCut, 10);
            expect(packed[1]).toBeCloseTo(t.fc, 8);
            expect(packed[2]).toBeCloseTo(t.pickHG, 8);
            expect(packed[3]).toBeCloseTo(t.cdfHG, 8);
        }
    });

    it('a amostragem segue a fase truncada (histograma em cos θ)', () => {
        // Arrange
        const p = jdeParams(20);
        const t = phaseTruncation(p);
        const rng = deltaRng(3, 7);
        const bins = [-1, -0.5, 0, 0.5, 0.8, 0.9, 0.95, 0.98, 0.99, t.cosCut];
        const counts = new Array(bins.length - 1).fill(0) as number[];
        const N = 400_000;
        // Act
        for (let k = 0; k < N; k++) {
            const c = sampleTruncatedCos(p, t, rng);
            for (let b = 0; b < bins.length - 1; b++)
                if (c >= bins[b]! && c <= bins[b + 1]!) {
                    counts[b]!++;
                    break;
                }
        }
        // Assert: a massa de cada faixa contra a integral da fase truncada.
        for (let b = 0; b < bins.length - 1; b++) {
            let mass = 0;
            const n = 20_000;
            for (let i = 0; i < n; i++) {
                const c = bins[b]! + ((i + 0.5) / n) * (bins[b + 1]! - bins[b]!);
                mass += truncatedPhase(c, p, t) * ((bins[b + 1]! - bins[b]!) / n) * 2 * Math.PI;
            }
            expect(Math.abs(counts[b]! / N - mass)).toBeLessThan(Math.max(0.004, 0.03 * mass));
        }
    });
});

describe('grade das sondas', () => {
    it('a posição da sonda e as coordenadas do ponto são inversas (centros em k + 0,5)', () => {
        // Arrange
        const g: ScatterGrid = {
            size: [160, 32, 160],
            center: [4000, -8000],
            x0: 2000,
            reach: Math.asinh(32),
        };
        for (const [i, j, k] of [
            [0, 0, 0],
            [80, 16, 79],
            [159, 31, 3],
            [41, 7, 120],
        ] as const) {
            // Act
            const x: Vec3 = scatterProbePosition(calibrationCloud, g, i, j, k);
            const c = scatterGridCoords(calibrationCloud, g, x);
            // Assert
            expect(c[0]).toBeCloseTo(i + 0.5, 6);
            expect(c[1]).toBeCloseTo(j + 0.5, 6);
            expect(c[2]).toBeCloseTo(k + 0.5, 6);
        }
    });
});
