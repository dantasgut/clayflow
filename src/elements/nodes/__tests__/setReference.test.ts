import { describe, expect, it } from 'vitest';
import { realizeTable } from '../set/points';
import {
    compact,
    displace,
    distributeOnMesh,
    grid,
    prefixSum,
    realizeInstances,
    recomputeNormals,
    reduce,
    sequence,
    sort,
    type ReferenceMesh,
} from '../reference/set';

// Referências em CPU dos nós de conjunto (spec 031, T077): as regras em amostras fixas — orientação, contagens,
// determinismo da distribuição e as primitivas.

/** Normal da face (b − a) × (c − a) do triângulo `t`. */
function faceNormal(m: ReferenceMesh, t: number): number[] {
    const p = (k: number) => [0, 1, 2].map((j) => m.vertices[m.triangles[t * 3 + k]! * 8 + j]!);
    const [a, b, c] = [p(0), p(1), p(2)];
    const e1 = b.map((x, j) => x - a[j]!);
    const e2 = c.map((x, j) => x - a[j]!);
    return [
        e1[1]! * e2[2]! - e1[2]! * e2[1]!,
        e1[2]! * e2[0]! - e1[0]! * e2[2]!,
        e1[0]! * e2[1]! - e1[1]! * e2[0]!,
    ];
}

describe('referências dos nós de conjunto', () => {
    it('grid: (v, 0, u) como o plano pronto, uv nos cantos, triângulos anti-horários vistos de +y', () => {
        const m = grid(4, 3, 2, 1);
        expect(m.vertices.length / 8).toBe(12);
        expect(m.triangles.length / 3).toBe(12);
        // Vértice (iu = 3, iv = 0): u = +1 (z), v = −0,5 (x).
        expect([...m.vertices.subarray(3 * 8, 4 * 8)]).toEqual([-0.5, 0, 1, 0, 1, 0, 1, 0]);
        for (let t = 0; t < 12; t++) {
            const n = faceNormal(m, t);
            expect(n[1]).toBeGreaterThan(0);
            expect(Math.abs(n[0]!) + Math.abs(n[2]!)).toBeLessThan(1e-12);
        }
    });

    it('displace e recomputeNormals: altura ao longo da normal; plano inclinado tem a normal da face', () => {
        const flat = grid(5, 5, 2, 2);
        const lifted = displace(flat, (p) => 0.5 * p[0], 2);
        // y = x: normal (−1, 1, 0)/√2 em todos os vértices.
        const m = recomputeNormals(lifted);
        for (let k = 0; k < 25; k++) {
            expect(m.vertices[k * 8 + 1]).toBeCloseTo(m.vertices[k * 8]!, 12);
            expect(m.vertices[k * 8 + 3]).toBeCloseTo(-Math.SQRT1_2, 12);
            expect(m.vertices[k * 8 + 4]).toBeCloseTo(Math.SQRT1_2, 12);
            expect(m.vertices[k * 8 + 5]).toBeCloseTo(0, 12);
        }
    });

    it('distributeOnMesh: determinística, dentro dos triângulos, densidade 1 aceita todos e 0 nenhum', () => {
        const m = grid(6, 6, 2, 2);
        const all = distributeOnMesh(m, () => 1, 3, 11);
        expect(all.points.length / 6).toBe(50 * 3);
        expect(distributeOnMesh(m, () => 0, 3, 11).points.length).toBe(0);
        const half = distributeOnMesh(m, (p) => (p[0] > 0 ? 1 : 0), 3, 11);
        expect(half.points).toEqual(distributeOnMesh(m, (p) => (p[0] > 0 ? 1 : 0), 3, 11).points);
        for (let i = 0; i < half.points.length / 6; i++) {
            expect(half.points[i * 6]).toBeGreaterThan(0);
            expect(half.points[i * 6 + 1]).toBe(0);
            expect(half.points[i * 6 + 4]).toBe(1);
            expect(Math.abs(half.points[i * 6 + 2]!)).toBeLessThanOrEqual(1);
        }
        expect(distributeOnMesh(m, () => 1, 3, 12).points).not.toEqual(all.points);
    });

    it('realizeInstances: esfera por ponto, normais unitárias radiais, triângulos para fora', () => {
        const m = realizeInstances(Float64Array.from([1, 2, 3, 0, 1, 0]), 0.5, 6, 4);
        expect(m.vertices.length / 8).toBe(7 * 5);
        expect(m.triangles.length / 3).toBe(48);
        for (let k = 0; k < 35; k++) {
            const d = [0, 1, 2].map((j) => (m.vertices[k * 8 + j]! - [1, 2, 3][j]!) / 0.5);
            expect(Math.hypot(...d)).toBeCloseTo(1, 12);
            expect(m.vertices[k * 8 + 3]).toBeCloseTo(d[0]!, 12);
        }
        for (let t = 0; t < 48; t++) {
            const n = faceNormal(m, t);
            if (Math.hypot(...n) < 1e-12) continue; // polos
            const c = [0, 1, 2].map(
                (j) =>
                    [0, 1, 2].reduce((s, k) => s + m.vertices[m.triangles[t * 3 + k]! * 8 + j]!, 0)
                        / 3
                    - [1, 2, 3][j]!,
            );
            expect(n[0]! * c[0]! + n[1]! * c[1]! + n[2]! * c[2]!).toBeGreaterThan(0);
        }
    });

    it('realizeTable: a tabela da GPU é a da referência em f32', () => {
        const t = realizeTable(8, 6);
        expect(t[2 * 3]).toBeCloseTo(1, 6); // sen(π/2)
        expect(t[2 * (7 + 2)]).toBeCloseTo(0, 6); // cos(π/2)
    });

    it('primitivas', () => {
        const v = [5, 0, 3, 0, 0, 9, 1];
        expect([...prefixSum(v)]).toEqual([0, 5, 5, 8, 8, 8, 17]);
        expect([...prefixSum(v, true)]).toEqual([5, 5, 8, 8, 8, 17, 18]);
        expect([...sort([0x13, 0x02, 0x21, 0x12], 4)]).toEqual([0x21, 0x02, 0x12, 0x13]);
        expect([...sort(v)]).toEqual([0, 0, 0, 1, 3, 5, 9]);
        expect([...compact(v)]).toEqual([0, 2, 5, 6]);
        expect([reduce(v, 'sum'), reduce(v, 'min'), reduce(v, 'max'), reduce([], 'max')]).toEqual([
            18, 0, 9, 0,
        ]);
        expect([...sequence(4, 10, 3)]).toEqual([10, 13, 16, 19]);
    });
});
