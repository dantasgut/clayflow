import { describe, expect, it } from 'vitest';
import { hashSigned, pcgHash, randomNext, randomSeed, randomUnit, RANDOM_GOLDEN } from '../random';

// Referência f64 da aleatoriedade (spec 037, R2): os valores de controle do PCG (bit a bit, os mesmos de
// `noiseReference.test.ts`), o intervalo de `random_unit` e a independência entre fluxos nomeados.

/** Correlação de Pearson. */
function pearson(a: readonly number[], b: readonly number[]): number {
    const n = a.length;
    const ma = a.reduce((s, x) => s + x, 0) / n;
    const mb = b.reduce((s, x) => s + x, 0) / n;
    let num = 0;
    let da = 0;
    let db = 0;
    for (let i = 0; i < n; i++) {
        const x = a[i]! - ma;
        const y = b[i]! - mb;
        num += x * y;
        da += x * x;
        db += y * y;
    }
    return num / Math.sqrt(da * db);
}

describe('referência da aleatoriedade', () => {
    it('PCG RXS-M-XS de 32 bits: os valores de controle', () => {
        expect([0, 1, 2, 12345, 0xffffffff].map(pcgHash)).toEqual([
            129708002, 2831084092, 2055130248, 4099845390, 3861530882,
        ]);
    });

    it('random_unit em [0, 1) nos u32 de borda (nunca 1)', () => {
        for (const h of [
            0, 1, 0xff, 0x100, 0x7fffffff, 0x80000000, 0xfffffeff, 0xffffff00, 0xffffffff,
        ]) {
            const u = randomUnit(h);
            expect(u).toBeGreaterThanOrEqual(0);
            expect(u).toBeLessThan(1);
        }
        expect(randomUnit(0xffffffff)).toBe(1 - 2 ** -24);
        // O `f32(h)/2³²` que ele substitui arredonda para 1 em f32 no topo: o motivo da troca (T016).
        expect(Math.fround(Math.fround(0xffffffff) / 4294967296)).toBe(1);
    });

    it('hash_signed em [−1, 1] fechado nas bordas', () => {
        expect(hashSigned(0)).toBe(-1);
        expect(hashSigned(0xffffffff)).toBeCloseTo(1, 12);
    });

    it('random_next avança o estado pela razão áurea e devolve o hash dele', () => {
        const state = { value: 7 };
        expect(randomNext(state)).toBe(pcgHash((7 + RANDOM_GOLDEN) >>> 0));
        expect(randomNext(state)).toBe(pcgHash((7 + 2 * RANDOM_GOLDEN) >>> 0));
        expect(state.value).toBe((7 + 2 * RANDOM_GOLDEN) >>> 0);
    });

    it('fluxos independentes: correlação de Pearson < 0,01 em 10⁵ índices', () => {
        const N = 100_000;
        const frame = 17;
        const streams = [0, 1, 2, 7];
        const series = streams.map((s) =>
            Array.from({ length: N }, (_, i) => randomUnit(randomSeed(s, i, frame))),
        );
        for (let a = 0; a < streams.length; a++)
            for (let b = a + 1; b < streams.length; b++)
                expect(Math.abs(pearson(series[a]!, series[b]!))).toBeLessThan(0.01);
        // E entre quadros consecutivos do mesmo fluxo.
        const next = Array.from({ length: N }, (_, i) => randomUnit(randomSeed(0, i, frame + 1)));
        expect(Math.abs(pearson(series[0]!, next))).toBeLessThan(0.01);
    });
});
