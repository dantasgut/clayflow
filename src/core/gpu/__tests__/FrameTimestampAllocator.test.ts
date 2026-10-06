import { describe, expect, it } from 'vitest';
import { FrameTimestampAllocator } from '../profiler/FrameTimestampAllocator';

describe('FrameTimestampAllocator', () => {
    it('entrega pares sequenciais a partir da base', () => {
        const a = new FrameTimestampAllocator(8, 2);
        a.begin(0);
        expect(a.allocatePair('a')).toEqual({ first: 2, last: 3, label: 'a' });
        expect(a.allocatePair('b')).toEqual({ first: 4, last: 5, label: 'b' });
        expect(a.pairs).toHaveLength(2);
        expect(a.end).toBe(6);
    });

    it('estouro devolve undefined e marca overflowed', () => {
        const a = new FrameTimestampAllocator(4);
        a.begin(0);
        expect(a.allocatePair('a')).toBeDefined();
        expect(a.allocatePair('b')).toBeDefined();
        expect(a.allocatePair('c')).toBeUndefined();
        expect(a.overflowed).toBe(true);
    });

    it('begin zera o estado e guarda o índice do quadro', () => {
        const a = new FrameTimestampAllocator(2);
        a.begin(0);
        a.allocatePair('a');
        a.allocatePair('b');
        a.begin(7);
        expect(a.frameIndex).toBe(7);
        expect(a.overflowed).toBe(false);
        expect(a.pairs).toHaveLength(0);
        expect(a.allocatePair('c')).toEqual({ first: 0, last: 1, label: 'c' });
    });

    it('registerExplicit inclui pares de timestamps explícitos', () => {
        const a = new FrameTimestampAllocator(8, 2);
        a.begin(0);
        a.registerExplicit({ first: 0, last: 1, label: 'forward' });
        expect(a.pairs).toEqual([{ first: 0, last: 1, label: 'forward' }]);
        expect(a.end).toBe(2);
    });

    it('sumIntervals soma (last − first) em ms e ignora pares inválidos', () => {
        const ns = new BigInt64Array([0n, 2_000_000n, 5_000_000n, 4_000_000n, 10n, 1_000_010n]);
        const pairs = [
            { first: 0, last: 1, label: 'a' },
            { first: 2, last: 3, label: 'inválido' },
            { first: 4, last: 5, label: 'b' },
        ];
        expect(FrameTimestampAllocator.sumIntervals(ns, pairs)).toBeCloseTo(3, 6);
        expect(FrameTimestampAllocator.intervalsByLabel(ns, pairs)).toEqual({
            a: 2_000_000,
            b: 1_000_000,
        });
    });

    it('sumIntervals devolve undefined sem pares válidos ou lista vazia', () => {
        const ns = new BigInt64Array([5n, 1n]);
        expect(FrameTimestampAllocator.sumIntervals(ns, [{ first: 0, last: 1, label: 'x' }])).toBe(
            undefined,
        );
        expect(FrameTimestampAllocator.sumIntervals(ns, [])).toBeUndefined();
        expect(
            FrameTimestampAllocator.sumIntervals(ns, [{ first: 4, last: 5, label: 'fora' }]),
        ).toBeUndefined();
        // não escritos (zeros): passe que não executou não vira 0 ms
        expect(
            FrameTimestampAllocator.sumIntervals(new BigInt64Array(2), [
                { first: 0, last: 1, label: 'z' },
            ]),
        ).toBeUndefined();
    });

    it('rótulos repetidos acumulam em intervalsByLabel', () => {
        const ns = new BigInt64Array([0n, 10n, 20n, 25n]);
        const pairs = [
            { first: 0, last: 1, label: 'p' },
            { first: 2, last: 3, label: 'p' },
        ];
        expect(FrameTimestampAllocator.intervalsByLabel(ns, pairs)).toEqual({ p: 15 });
    });
});
