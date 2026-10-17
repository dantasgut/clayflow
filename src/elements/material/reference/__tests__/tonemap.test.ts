import { describe, expect, it } from 'vitest';
import {
    present,
    srgbDecode,
    srgbEncode,
    tonemapAces,
    tonemapAgx,
    tonemapNeutral,
} from '../tonemap';

// Referências da apresentação (spec 011, T009): propriedades publicadas de cada operador e a curva sRGB.

const ramp = Array.from({ length: 64 }, (_, i) => Math.pow(2, -10 + i * 0.25));

describe('apresentação — referências de CPU', () => {
    it('sRGB: valores da norma e ida e volta', () => {
        expect(srgbEncode(0)).toBe(0);
        expect(srgbEncode(1)).toBeCloseTo(1, 12);
        expect(srgbEncode(0.5)).toBeCloseTo(0.735357, 5);
        expect(srgbEncode(0.0031308)).toBeCloseTo(0.04045, 5);
        for (const x of [0.001, 0.02, 0.18, 0.5, 0.9])
            expect(srgbDecode(srgbEncode(x))).toBeCloseTo(x, 9);
    });

    it('neutro (Khronos PBR Neutral): identidade abaixo do início da compressão, teto em 1', () => {
        for (const x of [0.1, 0.3, 0.5, 0.7]) {
            const out = tonemapNeutral([x, x, x]);
            expect(out[0]).toBeCloseTo(x - 0.04, 9);
        }
        expect(tonemapNeutral([1000, 1000, 1000])[0]).toBeLessThan(1);
        expect(tonemapNeutral([1000, 1000, 1000])[0]).toBeGreaterThan(0.99);
    });

    it('ACES (Hill): zero no preto, monótono, satura em 1; 0,18 vai a ~0,106 (o ajuste sem a exposição 1/0,6)', () => {
        expect(tonemapAces([0, 0, 0])[0]).toBeCloseTo(0, 3);
        let last = -1;
        for (const x of ramp) {
            const y = tonemapAces([x, x, x])[1];
            expect(y).toBeGreaterThanOrEqual(last);
            last = y;
        }
        expect(tonemapAces([100, 100, 100])[0]).toBeCloseTo(1, 2);
        expect(tonemapAces([0.18, 0.18, 0.18])[1]).toBeCloseTo(0.1056, 3);
    });

    it('AgX: monótono, cinza neutro continua neutro, realces não passam de 1', () => {
        let last = -1;
        for (const x of ramp) {
            const out = tonemapAgx([x, x, x]);
            expect(out[0]).toBeGreaterThanOrEqual(last - 1e-9);
            expect(Math.abs(out[0] - out[1])).toBeLessThan(1e-3);
            expect(Math.abs(out[1] - out[2])).toBeLessThan(1e-3);
            expect(out[0]).toBeLessThanOrEqual(1);
            last = out[0];
        }
        // O cinza médio de AgX fica perto de 0,18 linear (o "base" do Blender).
        const mid = tonemapAgx([0.18, 0.18, 0.18])[0];
        expect(mid).toBeGreaterThan(0.1);
        expect(mid).toBeLessThan(0.3);
    });

    it('apresentação: +1 EV dobra a entrada; linear sem operador é só sRGB', () => {
        expect(present([0.25, 0.25, 0.25], 'linear', 1)[0]).toBeCloseTo(srgbEncode(0.5), 12);
        expect(present([0.5, 0.2, 0.1], 'linear', 0)).toEqual([0.5, 0.2, 0.1].map(srgbEncode));
    });
});
