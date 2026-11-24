import { describe, expect, it } from 'vitest';
import {
    shadowAllocate,
    shadowAllocationOrder,
    shadowStepPick,
    type ShadowQueuedPage,
    type ShadowViewQueues,
} from '../shadowBudget';

/** Uma fila de `n` páginas novas (sem página física). */
const fresh = (n: number): ShadowQueuedPage[] => Array.from({ length: n }, () => 'new' as const);
/** Uma fila de `n` páginas a redesenhar (já têm página física). */
const redraw = (n: number): ShadowQueuedPage[] =>
    Array.from({ length: n }, () => 'redraw' as const);
/** Uma vista com as filas por nível (do mais fino ao mais grosso: o último é a reserva grossa). */
const view = (levels: ShadowQueuedPage[][], reset = false): ShadowViewQueues => ({ levels, reset });

/** O rodízio feito página a página, sem a bisseção: cada vista com fila entra uma vez por rodada. */
function roundRobin(counts: readonly number[]): [number, number][] {
    const out: [number, number][] = [];
    for (let round = 0; round < Math.max(0, ...counts); round++)
        counts.forEach((c, v) => {
            if (c > round) out.push([v, round]);
        });
    return out;
}

describe('fila de alocação das páginas de sombra entre as vistas (espelho de sp_allocate_main)', () => {
    it('a reserva grossa de cada vista vem primeiro, antes de qualquer nível mais fino', () => {
        // Arrange: três vistas com filas no nível fino (0) e na reserva grossa (2).
        const views = [
            view([fresh(40), [], fresh(2)]),
            view([fresh(40), [], fresh(1)]),
            view([fresh(40), [], fresh(3)]),
        ];
        // Act
        const order = shadowAllocationOrder(views, { budget: 256, capacity: 2304 });
        // Assert: as seis primeiras são do nível mais grosso, em rodízio; depois, só os níveis seguintes.
        expect(order.slice(0, 6).map((p) => [p.view, p.level, p.index])).toEqual([
            [0, 2, 0],
            [1, 2, 0],
            [2, 2, 0],
            [0, 2, 1],
            [2, 2, 1],
            [2, 2, 2],
        ]);
        expect(order.slice(6).every((p) => p.level === 0)).toBe(true);
    });

    it('nos níveis seguintes as vistas se revezam página a página, e o que não cabe no orçamento fica de fora por igual', () => {
        const views = [
            view([fresh(200), fresh(1)]),
            view([fresh(200), fresh(1)]),
            view([fresh(200), fresh(1)]),
        ];
        const order = shadowAllocationOrder(views, { budget: 62, capacity: 2304 });
        // Três da reserva grossa e 59 do nível fino: 20, 20 e 19 por vista.
        expect(order).toHaveLength(62);
        const fine = order.filter((p) => p.level === 0);
        expect([0, 1, 2].map((v) => fine.filter((p) => p.view === v).length)).toEqual([20, 20, 19]);
        expect(fine.slice(0, 6).map((p) => [p.view, p.index])).toEqual([
            [0, 0],
            [1, 0],
            [2, 0],
            [0, 1],
            [1, 1],
            [2, 1],
        ]);
    });

    it('o rodízio pela bisseção é o mesmo do feito página a página, com filas desiguais e vazias', () => {
        const cases = [
            [5, 2, 3],
            [0, 7, 0, 1],
            [1],
            [4096, 1, 4096],
            [3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3],
            [0, 0, 9],
        ];
        for (const counts of cases) {
            const expected = roundRobin(counts);
            const step = Math.max(1, Math.floor(expected.length / 97));
            for (let t = 0; t < expected.length; t += step)
                expect(shadowStepPick(counts, t), `${counts.join(',')} @ ${t}`).toEqual(
                    expected[t],
                );
            const last = expected.length - 1;
            expect(shadowStepPick(counts, last)).toEqual(expected[last]);
            // Além do total, nada.
            expect(shadowStepPick(counts, expected.length)).toBeUndefined();
        }
    });

    it('a vista cujo cache recomeça leva tudo o que pediu sem gastar o orçamento das que seguem', () => {
        // Arrange: a vista 0 recomeça (a luz girou) com 300 páginas; a 1 segue com 400 por alocar.
        const views = [view([fresh(298), fresh(2)], true), view([fresh(398), fresh(2)])];
        // Act
        const order = shadowAllocationOrder(views, { budget: 256, capacity: 2304 });
        // Assert: todas as 300 da que recomeça, e 256 (o orçamento) da que segue.
        expect(order.filter((p) => p.view === 0)).toHaveLength(300);
        expect(order.filter((p) => p.view === 1)).toHaveLength(256);
        // A reserva grossa das duas antes dos níveis seguintes; nos seguintes, a que recomeça na frente.
        expect(order.slice(0, 4).map((p) => [p.view, p.level])).toEqual([
            [0, 1],
            [0, 1],
            [1, 1],
            [1, 1],
        ]);
        expect(order.slice(4, 302).every((p) => p.view === 0)).toBe(true);
    });

    it('o recomeço de uma vista não tira as páginas das outras: só as livres são dadas, e os redesenhos das outras entram', () => {
        // Arrange: 100 páginas físicas livres; a vista 0 recomeça pedindo 150; a 1 segue, com 10 a redesenhar (nas
        // páginas que já tem) e 5 novas.
        const views = [
            view([fresh(148), fresh(2)], true),
            view([[...redraw(10), ...fresh(5)], redraw(1)]),
        ];
        // Act
        const entering = shadowAllocate(views, { budget: 256, capacity: 2304, free: 100 });
        // Assert: as livres vão na ordem (a reserva grossa das duas e depois a que recomeça), cada uma a uma página.
        const given = entering.filter((p) => p.free !== undefined);
        expect(given.map((p) => p.free)).toEqual(Array.from({ length: 100 }, (_, i) => i));
        expect(given.every((p) => p.view === 0)).toBe(true);
        // A vista que segue redesenha as 11 que já tem (nenhuma página dela foi tomada) e não ganha página nova.
        const other = entering.filter((p) => p.view === 1);
        expect(other).toHaveLength(11);
        expect(other.every((p) => p.free === undefined)).toBe(true);
        // A que recomeça fica com 100 das 150; o resto espera os quadros seguintes com o nível mais grosso desenhado.
        expect(entering.filter((p) => p.view === 0)).toHaveLength(100);
        expect(entering.filter((p) => p.view === 0 && p.level === 1)).toHaveLength(2);
    });

    it('com uma vista só, a ordem é a de antes: do nível mais grosso ao mais fino, até o orçamento; no recomeço, até o atlas', () => {
        const one = [view([fresh(300), fresh(20), fresh(4)])];
        const following = shadowAllocationOrder(one, { budget: 256, capacity: 1024 });
        expect(following).toHaveLength(256);
        expect(following.slice(0, 4).every((p) => p.level === 2)).toBe(true);
        expect(following.slice(4, 24).map((p) => [p.level, p.index])).toEqual(
            Array.from({ length: 20 }, (_, i) => [1, i]),
        );
        expect(following.slice(24).map((p) => [p.level, p.index])).toEqual(
            Array.from({ length: 232 }, (_, i) => [0, i]),
        );
        const reset = shadowAllocationOrder([{ ...one[0]!, reset: true }], {
            budget: 256,
            capacity: 1024,
        });
        expect(reset).toHaveLength(324);
        // O atlas menor que o pedido: até a capacidade.
        expect(
            shadowAllocationOrder([{ ...one[0]!, reset: true }], { budget: 256, capacity: 100 }),
        ).toHaveLength(100);
    });

    it('vistas com números de níveis diferentes: o passo conta do mais grosso de cada uma', () => {
        const views = [view([fresh(1), fresh(1), fresh(1)]), view([fresh(1)])];
        const order = shadowAllocationOrder(views, { budget: 256, capacity: 2304 });
        expect(order.map((p) => [p.view, p.level])).toEqual([
            [0, 2],
            [1, 0],
            [0, 1],
            [0, 0],
        ]);
    });
});
