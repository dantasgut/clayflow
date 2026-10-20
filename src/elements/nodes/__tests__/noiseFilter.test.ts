/**
 * Filtragem dos nós de ruído na origem (spec 034, H6), pela referência da CPU (a mesma aritmética da GPU, conferida no
 * smoke `nodeGraphs` (f)): sem largura, o ruído de antes; com a célula abaixo de ¼ de pixel, o valor cheio; acima de ¾,
 * a média (0); no fBm, cada oitava some pela largura na frequência dela.
 */
import { describe, expect, it } from 'vitest';
import { noiseBand, noiseFbm3, noiseGradient3, noiseValue3 } from '../reference/noiseNodes';

const points = Array.from(
    { length: 64 },
    (_, i) => [i * 0.37, i * 0.11 - 3, 2 - i * 0.23] as const,
);

describe('nós de ruído filtrados pela largura do pixel', () => {
    it('largura 0: o ruído sem filtragem, bit a bit', () => {
        for (const p of points) {
            expect(noiseGradient3(p, 2, [0, 0, 0], 7, 0)).toBe(noiseGradient3(p, 2, [0, 0, 0], 7));
            expect(noiseValue3(p, 2, [0, 0, 0], 7, 0)).toBe(noiseValue3(p, 2, [0, 0, 0], 7));
        }
    });

    it('faixa: inteiro abaixo de ¼ de célula por pixel, a média (0) acima de ¾, monótono entre', () => {
        expect(noiseBand(0.2)).toBe(1);
        expect(noiseBand(0.8)).toBe(0);
        let last = 1;
        for (let w = 0.25; w <= 0.75; w += 0.05) {
            const b = noiseBand(w);
            expect(b).toBeLessThanOrEqual(last);
            last = b;
        }
        for (const p of points) expect(Math.abs(noiseGradient3(p, 4, [0, 0, 0], 3, 0.25))).toBe(0);
    });

    it('fBm: as oitavas mais finas que o pixel somem; as mais grossas ficam inteiras', () => {
        // Escala 1, lacunaridade 2: com largura 0,1 as oitavas 0–1 (w 0,1 e 0,2) ficam; a 2 (0,4) cai pela faixa; 3+ somem.
        const gain = 0.5;
        const norm = 1 + 0.5 + 0.25 + 0.125;
        for (const p of points) {
            const filtered = noiseFbm3(p, 1, [0, 0, 0], 5, 4, 2, gain, 0.1);
            let expected = 0;
            let amp = 1;
            for (let k = 0; k < 4; k++) {
                const octave = noiseFbm3(
                    p.map((x) => x * 2 ** k) as unknown as [number, number, number],
                    1,
                    [0, 0, 0],
                    5 + k,
                    1,
                    2,
                    gain,
                );
                expected += amp * octave * noiseBand(0.1 * 2 ** k);
                amp *= gain;
            }
            expect(filtered).toBeCloseTo(expected / norm, 5);
        }
    });
});
