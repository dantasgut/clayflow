/**
 * Spec 010 (US4): normais da geometria paramétrica de CPU por diferenças da própria função — o lado da frente dos
 * triângulos, a ≤ 1° da analítica na esfera, finitas nos polos.
 */
import { describe, expect, it } from 'vitest';
import { ParametricGeometry } from '../ParametricGeometry';

/** Ângulo (graus) entre a normal do vértice i e o vetor d. */
function angle(v: Float32Array, i: number, d: readonly number[]): number {
    const n = [v[i * 8 + 3]!, v[i * 8 + 4]!, v[i * 8 + 5]!];
    const dot = (n[0]! * d[0]! + n[1]! * d[1]! + n[2]! * d[2]!) / Math.hypot(...d);
    return (Math.acos(Math.max(-1, Math.min(1, dot))) * 180) / Math.PI;
}

describe('ParametricGeometry — normais (spec 010)', () => {
    it('plano z = 0: normal do lado da frente (∂f/∂v × ∂f/∂u = −z) em todos os vértices', () => {
        const g = new ParametricGeometry({
            fn: (u: number, v: number) => [4 * u - 2, 4 * v - 2, 0],
        });
        const v = g.data.vertices!;
        for (let i = 0; i < g.vertexCount; i++) expect(angle(v, i, [0, 0, -1])).toBeLessThan(1e-3);
    });

    it('esfera: a ≤ 1° da radial (orientação do enrolamento), finita nos polos', () => {
        const sphere = (u: number, v: number): [number, number, number] => {
            const a = 2 * Math.PI * u;
            const b = Math.PI * v;
            return [Math.sin(b) * Math.cos(a), Math.cos(b), -Math.sin(b) * Math.sin(a)];
        };
        const g = new ParametricGeometry({ fn: sphere, uSteps: 48, vSteps: 24 });
        const v = g.data.vertices!;
        let worst = 0;
        for (let i = 0; i < g.vertexCount; i++) {
            const p = [v[i * 8]!, v[i * 8 + 1]!, v[i * 8 + 2]!];
            for (let k = 3; k < 6; k++) expect(Number.isFinite(v[i * 8 + k]!)).toBe(true);
            worst = Math.max(worst, angle(v, i, p));
        }
        expect(worst).toBeLessThanOrEqual(1);
    });

    it('a normal aponta para o lado da frente: (c − a) × (b − a) do primeiro triângulo', () => {
        const g = new ParametricGeometry({
            fn: (u: number, v: number) => [u, Math.sin(3 * u) * 0.2 + v * v * 0.1, v],
        });
        const v = g.data.vertices!;
        const [a, c, b] = [...g.data.indices!.slice(0, 3)];
        const p = (i: number) => [v[i * 8]!, v[i * 8 + 1]!, v[i * 8 + 2]!];
        const [pa, pb, pc] = [p(a!), p(b!), p(c!)];
        const e1 = [0, 1, 2].map((k) => pc[k]! - pa[k]!);
        const e2 = [0, 1, 2].map((k) => pb[k]! - pa[k]!);
        const face = [
            e1[1]! * e2[2]! - e1[2]! * e2[1]!,
            e1[2]! * e2[0]! - e1[0]! * e2[2]!,
            e1[0]! * e2[1]! - e1[1]! * e2[0]!,
        ];
        expect(angle(v, a!, face)).toBeLessThan(10);
    });
});
