import { describe, expect, it } from 'vitest';
import { SoftBody } from '../bodies/SoftBody';
import { DistanceConstraint, XPBD_SERIAL_COLOR } from '../constraints/DistanceConstraint';

/**
 * As cores das arestas do `SoftBody` (spec 034, T061b): o solver XPBD resolve cada cor em paralelo e as cores em
 * sequência (Gauss-Seidel por cor), então arestas da mesma cor não podem compartilhar nó; elas vêm ordenadas por cor
 * (cada cor um trecho contíguo) e a contagem vai na faixa do corpo. A restrição avulsa vai na cor serial.
 */
describe('cores das arestas do SoftBody (spec 034, T061b)', () => {
    /** Pano n × n com as estruturais e as duas diagonais de cada quadrado (o do smoke `softSurface`). */
    function cloth(n: number): SoftBody {
        const position: number[] = [];
        for (let j = 0; j < n; j++)
            for (let i = 0; i < n; i++) position.push(i * 0.05, 1, j * 0.05);
        const a: number[] = [];
        const b: number[] = [];
        const at = (i: number, j: number): number => j * n + i;
        for (let j = 0; j < n; j++)
            for (let i = 0; i < n; i++) {
                if (i + 1 < n) {
                    a.push(at(i, j));
                    b.push(at(i + 1, j));
                }
                if (j + 1 < n) {
                    a.push(at(i, j));
                    b.push(at(i, j + 1));
                }
                if (i + 1 < n && j + 1 < n) {
                    a.push(at(i, j), at(i + 1, j));
                    b.push(at(i + 1, j + 1), at(i, j + 1));
                }
            }
        return new SoftBody({ algorithm: 'XPBD', position, mass: 0.01, edges: { a, b } });
    }

    it('nenhum nó com duas arestas da mesma cor; em ordem de cor; a contagem na faixa', () => {
        const body = cloth(16);
        const edges = body.data.edges!;
        const i = edges.i as Uint32Array;
        const j = edges.j as Uint32Array;
        const color = edges.color as Uint32Array;
        const seen = new Set<string>();
        for (let k = 0; k < color.length; k++) {
            for (const node of [i[k]!, j[k]!]) {
                const key = `${node}:${color[k]}`;
                expect(seen.has(key)).toBe(false);
                seen.add(key);
            }
            if (k > 0) expect(color[k]!).toBeGreaterThanOrEqual(color[k - 1]!);
        }
        const colors = Math.max(...color) + 1;
        expect(colors).toBeLessThan(XPBD_SERIAL_COLOR);
        // As cores usadas são contíguas (a gulosa só usa a cor c depois de todas as menores).
        expect(new Set(color).size).toBe(colors);
        expect(body.edgeColors).toBe(colors);
        expect(Array.from(body.data.range!.edge_colors!)).toEqual([colors]);
    });

    it('a restrição avulsa vai na cor serial', () => {
        const a = cloth(2);
        const b = cloth(2);
        const c = new DistanceConstraint({ a: { body: a, index: 0 }, b: { body: b, index: 0 } });
        expect(c.data.color).toBe(XPBD_SERIAL_COLOR);
    });
});
