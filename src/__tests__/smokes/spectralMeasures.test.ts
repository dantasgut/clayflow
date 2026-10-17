import { describe, expect, it } from 'vitest';
import {
    bandEnergy,
    contourRipple,
    isolatedHighlights,
    neighborSteps,
    regionBandAmplitude,
    silhouetteRows,
} from '../../__smokes__/support/spectralMeasures';

function image(w: number, h: number, f: (x: number, y: number) => number): ImageData {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
            const v = Math.round(Math.min(Math.max(f(x, y), 0), 1) * 255);
            const i = (y * w + x) * 4;
            data[i] = data[i + 1] = data[i + 2] = v;
            data[i + 3] = 255;
        }
    return { width: w, height: h, data, colorSpace: 'srgb' };
}

describe('medidas de imagem da 033 (spec 033, T005)', () => {
    it('energia na faixa: senóide de período 8 cai na faixa [6, 10], reta não', () => {
        const sine = Array.from({ length: 128 }, (_, i) => Math.sin((2 * Math.PI * i) / 8));
        expect(bandEnergy(sine, 6, 10)).toBeGreaterThan(0.95);
        const line = Array.from({ length: 128 }, (_, i) => 0.3 * i);
        expect(bandEnergy(line, 6, 10)).toBe(0);
    });

    it('silhueta com semicírculos tem ondulação na escala; silhueta lisa inclinada não', () => {
        const bumps = image(128, 64, (x, y) =>
            y > 30 + 3 * Math.abs(Math.sin((Math.PI * x) / 8)) ? 1 : 0,
        );
        const smooth = image(128, 64, (x, y) => (y > 20 + 0.1 * x ? 1 : 0));
        const rect = { x: 0, y: 0, w: 128, h: 64 };
        const rb = contourRipple(silhouetteRows(bumps, rect, 0.5), 6, 10);
        const rs = contourRipple(silhouetteRows(smooth, rect, 0.5), 6, 10);
        expect(rb.rms).toBeGreaterThan(0.5);
        expect(rb.band).toBeGreaterThan(0.5);
        expect(rs.rms).toBeLessThan(0.35);
    });

    it('favo de mel: padrão periódico detectado na região', () => {
        const comb = image(
            64,
            64,
            (x, y) => 0.5 + 0.2 * Math.sin((2 * Math.PI * x) / 6) * Math.sin((2 * Math.PI * y) / 6),
        );
        const flat = image(64, 64, (x) => 0.3 + x / 200);
        const rect = { x: 0, y: 0, w: 64, h: 64 };
        expect(regionBandAmplitude(comb, rect, 4, 8)).toBeGreaterThan(0.05);
        expect(regionBandAmplitude(flat, rect, 4, 8)).toBeLessThan(0.003);
    });

    it('realce contínuo contra pontos isolados; degraus entre vizinhos', () => {
        const line = image(32, 16, (_x, y) => (y === 8 ? 1 : 0));
        const dots = image(32, 16, (x, y) => (y === 8 && x % 4 === 0 ? 1 : 0));
        const rect = { x: 0, y: 0, w: 32, h: 16 };
        expect(isolatedHighlights(line, rect, 0.8)).toBe(0);
        expect(isolatedHighlights(dots, rect, 0.8)).toBe(1);
        const ramp = image(64, 8, (x) => x / 64);
        const bands = image(64, 8, (x) => Math.floor(x / 16) / 4);
        expect(neighborSteps(ramp, { x: 0, y: 0, w: 64, h: 8 }, 0.03)).toBe(0);
        expect(neighborSteps(bands, { x: 0, y: 0, w: 64, h: 8 }, 0.03)).toBeGreaterThan(0);
    });
});
