import { describe, expect, it } from 'vitest';
import { FreeRanges } from '../systems/FreeRanges';

describe('FreeRanges', () => {
    it('candidatos em ordem crescente, só onde cabe a faixa', () => {
        const free = new FreeRanges();
        free.release(10, 2);
        free.release(2, 4);
        expect([...free.candidates(3)]).toEqual([2, 3]);
        expect([...free.candidates(2)]).toEqual([2, 3, 4, 10]);
    });

    it('liberação coalesce com os vizinhos', () => {
        const free = new FreeRanges();
        free.release(0, 2);
        free.release(4, 2);
        free.release(2, 2);
        expect(free.contains(0, 6)).toBe(true);
        expect([...free.candidates(6)]).toEqual([0]);
    });

    it('take parte um intervalo ao meio e tira das pontas', () => {
        const free = new FreeRanges();
        free.release(0, 10);
        free.take(3, 2);
        expect(free.contains(0, 3)).toBe(true);
        expect(free.contains(3, 1)).toBe(false);
        expect(free.contains(5, 5)).toBe(true);
        free.take(0, 3);
        free.take(8, 2);
        expect(free.size).toBe(3);
        expect([...free.candidates(3)]).toEqual([5]);
    });

    it('take sobre slots já ocupados ignora o que não está livre', () => {
        const free = new FreeRanges();
        free.release(5, 2);
        free.take(0, 10);
        expect(free.size).toBe(0);
    });
});
