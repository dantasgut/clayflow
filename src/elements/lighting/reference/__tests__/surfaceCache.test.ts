/**
 * Cache de irradiância nas superfícies (spec 034, T059, T060e): a referência f64 de `gi_cache.wgsl` na representação da
 * GPU (as palavras `u32` da tabela) — a chave por célula, nível e normal; a busca e a inserção com a troca da célula sem
 * uso; a época; a seleção do quadro e o acúmulo pela resposta.
 */
import { describe, expect, it } from 'vitest';
import {
    bitsF32,
    CACHE_EVICT,
    CACHE_MEMORY,
    CACHE_NONE,
    CACHE_WORDS,
    cacheBlend,
    cacheKey,
    cacheReady,
    cacheSelect,
    cacheTouch,
    createCache,
    octEncode,
    type CacheParams,
} from '../surfaceCache';

const EYE = [0, 0, 0] as const;
const UP = [0, 1, 0] as const;
const params = (over: Partial<CacheParams> = {}): CacheParams => ({
    cells: 4096,
    base: 0.025,
    lod: 64,
    frame: 1,
    epoch: 1,
    ...over,
});

describe('cache de irradiância nas superfícies (referência de gi_cache.wgsl)', () => {
    it('a chave: a mesma na célula, outra na vizinha e com outra normal; o lado dobra com a distância', () => {
        const c = params();
        const a = cacheKey([0.301, 0, 0.301], UP, EYE, c);
        expect(cacheKey([0.32, 0, 0.32], UP, EYE, c)).toEqual(a);
        expect(cacheKey([0.33, 0, 0.301], UP, EYE, c).key).not.toBe(a.key);
        expect(cacheKey([0.301, 0, 0.301], [1, 0, 0], EYE, c).key).not.toBe(a.key);
        expect(a.key % 2).toBe(1);
        expect(a.start).toBeLessThan(c.cells);
        // Até 64 lados da câmera, a célula mais fina; a cada dobro da distância além, o dobro do lado.
        expect(a.size).toBeCloseTo(0.025, 12);
        expect(cacheKey([3.3, 0, 0], UP, EYE, c).size).toBeCloseTo(0.05, 12);
        expect(cacheKey([6.5, 0, 0], UP, EYE, c).size).toBeCloseTo(0.1, 12);
        // Coordenadas negativas: as células dos dois lados da origem são distintas.
        expect(cacheKey([-0.01, 0, 0.01], UP, EYE, c).key).not.toBe(
            cacheKey([0.01, 0, 0.01], UP, EYE, c).key,
        );
    });

    it('a octaédrica cobre as duas metades da esfera', () => {
        expect(octEncode([0, 0, 1])).toEqual([0, 0]);
        const [x, y] = octEncode([0, 0, -1]);
        expect(Math.abs(x)).toBe(1);
        expect(Math.abs(y)).toBe(1);
        expect(octEncode([1, 0, 0])).toEqual([1, 0]);
    });

    it('a inserção grava a célula nas palavras da GPU; a busca a acha sem inserir de novo', () => {
        const cache = createCache(4096);
        const c = params({ frame: 7, epoch: 3 });
        const p = [0.31, 0.21, -0.39] as const;
        expect(cacheTouch(cache, p, UP, EYE, false, c)).toBe(CACHE_NONE);
        const cell = cacheTouch(cache, p, UP, EYE, true, c);
        expect(cell).not.toBe(CACHE_NONE);
        const w = (k: number): number => cache.table[cell * CACHE_WORDS + k]!;
        expect(w(0)).toBe(cacheKey(p, UP, EYE, c).key);
        expect(w(1)).toBe(3);
        expect(w(2)).toBe(7);
        expect(bitsF32(w(4))).toBeCloseTo(0.31, 6);
        expect(bitsF32(w(5))).toBeCloseTo(0.21, 6);
        expect(bitsF32(w(6))).toBeCloseTo(-0.39, 6);
        expect(bitsF32(w(7))).toBeCloseTo(0.025, 6);
        // Outro ponto na mesma célula: a mesma, marcada como usada no quadro.
        const later = params({ frame: 9, epoch: 3 });
        expect(cacheTouch(cache, [0.32, 0.22, -0.38], UP, EYE, false, later)).toBe(cell);
        expect(w(2)).toBe(9);
        expect(
            cache.table.filter((_, i) => i % CACHE_WORDS === 0 && cache.table[i] !== 0),
        ).toHaveLength(1);
    });

    it('com as posições sondadas ocupadas, só a célula sem uso há CACHE_EVICT quadros dá lugar', () => {
        // Uma tabela de 8 células: as 8 posições sondadas são a tabela inteira.
        const cache = createCache(8);
        const points = Array.from({ length: 40 }, (_, k) => [k * 0.1 + 0.01, 0, 0.01] as const);
        let filled = 0;
        let k = 0;
        for (; k < points.length && filled < 8; k++)
            if (
                cacheTouch(cache, points[k]!, UP, EYE, true, params({ cells: 8, frame: 1 }))
                !== CACHE_NONE
            )
                filled++;
        expect(filled).toBe(8);
        const next = points[k]!;
        expect(
            cacheTouch(
                cache,
                next,
                UP,
                EYE,
                true,
                params({ cells: 8, frame: 1 + CACHE_EVICT - 1 }),
            ),
        ).toBe(CACHE_NONE);
        const taken = cacheTouch(
            cache,
            next,
            UP,
            EYE,
            true,
            params({ cells: 8, frame: 1 + CACHE_EVICT }),
        );
        expect(taken).not.toBe(CACHE_NONE);
        expect(cache.table[taken * CACHE_WORDS]).toBe(
            cacheKey(next, UP, EYE, params({ cells: 8 })).key,
        );
    });

    it('a época nova: a célula da anterior recomeça no ponto (a mesma chave) e não tem acúmulo', () => {
        const cache = createCache(4096);
        const c1 = params({ epoch: 1 });
        const cell = cacheTouch(cache, [0.31, 0, 0.31], UP, EYE, true, c1);
        cacheBlend(cache, cell, [[1, 1, 1]], 1, 0.9, false, c1);
        expect(cacheReady(cache, cell, c1)).toBe(true);
        const c2 = params({ epoch: 2, frame: 2 });
        expect(cacheReady(cache, cell, c2)).toBe(false);
        expect(cacheTouch(cache, [0.32, 0, 0.32], UP, EYE, false, c2)).toBe(cell);
        expect(cache.table[cell * CACHE_WORDS + 1]).toBe(2);
    });

    it('a seleção: as da época usadas há até 2 quadros, no orçamento, em rodízio', () => {
        const cache = createCache(64);
        const cells: number[] = [];
        for (let k = 0; k < 6; k++)
            cells.push(
                cacheTouch(
                    cache,
                    [k * 0.1 + 0.01, 0, 0.01],
                    UP,
                    EYE,
                    true,
                    params({ cells: 64, frame: 10 }),
                ),
            );
        // Uma usada há 3 quadros fica fora.
        cacheTouch(cache, [0.51, 0, 0.01], UP, EYE, false, params({ cells: 64, frame: 7 }));
        const c = params({ cells: 64, frame: 10 });
        const all = cacheSelect(cache, 64, c);
        expect(new Set(all)).toEqual(new Set(cells.slice(0, 5)));
        const budget = cacheSelect(cache, 2, c);
        expect(budget).toHaveLength(2);
        // O começo anda o orçamento a cada quadro: com mais células em uso que ele, todas passam em rodízio.
        const seen = new Set<number>();
        for (let f = 10; f < 10 + 32; f++) {
            const cf = params({ cells: 64, frame: f });
            for (let k = 0; k < 5; k++)
                cacheTouch(cache, [k * 0.1 + 0.01, 0, 0.01], UP, EYE, false, cf);
            for (const x of cacheSelect(cache, 2, cf)) seen.add(x);
        }
        expect(seen).toEqual(new Set(cells.slice(0, 5)));
    });

    it('o acúmulo: o primeiro valor inteiro, depois a média com a memória até CACHE_MEMORY; sem raios, nada', () => {
        const cache = createCache(4096);
        const c = params();
        const cell = cacheTouch(cache, [0.3, 0, 0.3], UP, EYE, true, c);
        expect(cacheReady(cache, cell, c)).toBe(false);
        cacheBlend(
            cache,
            cell,
            [
                [2, 2, 2],
                [1, 1, 1],
            ],
            1,
            0.9,
            false,
            c,
        );
        expect(cacheReady(cache, cell, c)).toBe(true);
        expect(cache.values[cell]!.irradiance).toEqual([
            [2, 2, 2],
            [1, 1, 1],
        ]);
        for (let k = 0; k < 200; k++)
            cacheBlend(
                cache,
                cell,
                [
                    [2, 2, 2],
                    [1, 1, 1],
                ],
                1,
                0.99,
                false,
                c,
            );
        cacheBlend(
            cache,
            cell,
            [
                [4, 4, 4],
                [1, 1, 1],
            ],
            1,
            0.99,
            false,
            c,
        );
        // A memória mais longa é CACHE_MEMORY: o valor novo pesa ao menos 1 − 0,95.
        expect(cache.values[cell]!.irradiance[0]![0]).toBeGreaterThanOrEqual(
            2 + 2 * (1 - CACHE_MEMORY) - 1e-12,
        );
        const before = structuredClone(cache.values[cell]);
        cacheBlend(
            cache,
            cell,
            [
                [9, 9, 9],
                [9, 9, 9],
            ],
            0,
            0.99,
            false,
            c,
        );
        expect(cache.values[cell]).toEqual(before);
        // A luz que mudou: a histerese de resposta.
        cacheBlend(
            cache,
            cell,
            [
                [10, 10, 10],
                [1, 1, 1],
            ],
            1,
            0.99,
            true,
            c,
        );
        expect(cache.values[cell]!.irradiance[0]![0]).toBeGreaterThan(7);
    });
});
