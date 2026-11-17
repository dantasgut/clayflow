import { describe, expect, it } from 'vitest';
import {
    noiseCellular3,
    noiseFbm3,
    noiseGradient2,
    noiseGradient3,
    noiseValue3,
} from '../noiseNodes';

// Ruído periódico (spec 041, R3): f(p + period/scale) = f(p) bit a bit (a célula reduzida módulo o período é inteira,
// a posição dentro dela é a mesma) e `period = 0` é o ruído de antes.

/** Pontos diádicos (exatos em f32 com escalas potências de 2). */
const points: (readonly [number, number, number])[] = [];
for (let i = 0; i < 64; i++)
    points.push([((i * 37) % 64) / 16 - 2, ((i * 11) % 64) / 8 - 3, ((i * 53) % 64) / 32 - 1]);

describe('ruído com período', () => {
    it('gradiente e valor 3D repetem com período period/scale, bit a bit', () => {
        // Arrange
        const scale = 2;
        const offset = [0.25, -0.5, 0.75] as const;
        // Act + Assert
        for (const period of [1, 3, 4, 7]) {
            const shift = period / scale;
            for (const p of points) {
                for (const axis of [0, 1, 2]) {
                    const q = [...p] as [number, number, number];
                    q[axis] = q[axis]! + shift;
                    expect(noiseGradient3(q, scale, offset, 9, 0, period)).toBe(
                        noiseGradient3(p, scale, offset, 9, 0, period),
                    );
                    expect(noiseValue3(q, scale, offset, 0, 0, period)).toBe(
                        noiseValue3(p, scale, offset, 0, 0, period),
                    );
                }
            }
        }
    });

    it('gradiente 2D e celular 3D repetem com o período, bit a bit', () => {
        for (const period of [2, 5]) {
            for (const p of points) {
                expect(noiseGradient2([p[0] + period, p[1]], 1, [0, 0], 3, 0, period)).toBe(
                    noiseGradient2([p[0], p[1]], 1, [0, 0], 3, 0, period),
                );
                const a = noiseCellular3(p, 1, [0, 0, 0], 4, 1, period);
                const b = noiseCellular3(
                    [p[0], p[1] - period, p[2] + period],
                    1,
                    [0, 0, 0],
                    4,
                    1,
                    period,
                );
                expect(b).toEqual(a);
            }
        }
    });

    it('fBm com lacunaridade inteira repete com o período da primeira oitava', () => {
        for (const p of points) {
            const q: [number, number, number] = [p[0] + 4, p[1], p[2] - 4];
            expect(noiseFbm3(q, 1, [0, 0, 0], 7, 5, 2, 0.5, 0, 4)).toBe(
                noiseFbm3(p, 1, [0, 0, 0], 7, 5, 2, 0.5, 0, 4),
            );
        }
    });

    it('não é constante: o período não achata o ruído', () => {
        const values = new Set(points.map((p) => noiseGradient3(p, 1, [0, 0, 0], 0, 0, 4)));
        expect(values.size).toBeGreaterThan(32);
    });

    it('dentro do primeiro período, com a célula na origem, coincide com o ruído sem período', () => {
        // Arrange: células em [0, period − 2] — nenhum canto passa do período, nenhum índice negativo.
        const period = 8;
        for (const p of points) {
            const q: [number, number, number] = [
                Math.abs(p[0]) % 6,
                Math.abs(p[1]) % 6,
                Math.abs(p[2]) % 6,
            ];
            // Act + Assert
            expect(noiseGradient3(q, 1, [0, 0, 0], 5, 0, period)).toBe(
                noiseGradient3(q, 1, [0, 0, 0], 5, 0, 0),
            );
        }
    });

    it('period 0 é o ruído de antes (sem o argumento)', () => {
        for (const p of points) {
            expect(noiseGradient3(p, 2, [0, 0, 0], 1, 0, 0)).toBe(
                noiseGradient3(p, 2, [0, 0, 0], 1),
            );
            expect(noiseFbm3(p, 1, [0, 0, 0], 2, 4, 2, 0.5, 0, 0)).toBe(
                noiseFbm3(p, 1, [0, 0, 0], 2, 4, 2, 0.5),
            );
        }
    });
});
