import { describe, expect, it } from 'vitest';
import {
    gradientNoise2,
    gradientNoise3,
    hash2,
    hash3,
    pcgHash,
    valueNoise2,
    valueNoise3,
} from '../../../__smokes__/support/noiseReference';

// Referência em CPU do módulo WGSL `noise` (spec 005, R7). Os valores da GPU são comparados com ela no smoke
// `shaderLibrary`; aqui ficam as propriedades da própria referência.

describe('referência do ruído', () => {
    it('PCG RXS-M-XS de 32 bits (valores de controle calculados independentemente)', () => {
        expect([0, 1, 2, 12345, 0xffffffff].map(pcgHash)).toEqual([
            129708002, 2831084092, 2055130248, 4099845390, 3861530882,
        ]);
    });

    it('hash2/hash3 determinísticos e sensíveis a cada coordenada', () => {
        expect(hash2(3, 4)).toBe(hash2(3, 4));
        expect(hash2(3, 4)).not.toBe(hash2(4, 3));
        expect(hash3(1, 2, 3)).not.toBe(hash3(1, 2, 4));
    });

    const samples = Array.from({ length: 2000 }, (_, i) => [
        Math.sin(i * 12.9898) * 37.1,
        Math.cos(i * 78.233) * 19.7,
        Math.sin(i * 3.7) * 11.3,
    ]);

    it.each([
        ['valueNoise2', (p: number[]) => valueNoise2(p[0]!, p[1]!)],
        ['valueNoise3', (p: number[]) => valueNoise3(p[0]!, p[1]!, p[2]!)],
        ['gradientNoise2', (p: number[]) => gradientNoise2(p[0]!, p[1]!)],
        ['gradientNoise3', (p: number[]) => gradientNoise3(p[0]!, p[1]!, p[2]!)],
    ] as const)('%s em [-1, 1], determinístico e contínuo', (_, f) => {
        for (const p of samples) {
            const v = f(p);
            expect(v).toBeGreaterThanOrEqual(-1);
            expect(v).toBeLessThanOrEqual(1);
            expect(f(p)).toBe(v);
            const near = f(p.map((c) => c + 1e-4));
            expect(Math.abs(near - v)).toBeLessThan(0.01);
        }
    });

    it('ruído de gradiente é zero nos pontos da grade', () => {
        expect(gradientNoise2(3, -7)).toBe(0);
        expect(gradientNoise3(2, 5, -1)).toBe(0);
    });

    it('ruído de valor nos pontos da grade é o valor do hash', () => {
        const h = hash2(3, 4);
        expect(valueNoise2(3, 4)).toBeCloseTo((h >>> 8) * (2 / 16777215) - 1, 12);
    });
});
