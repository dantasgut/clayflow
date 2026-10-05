import { describe, expect, it } from 'vitest';
import { BoxGeometry } from '../BoxGeometry';
import { PlaneGeometry } from '../PlaneGeometry';
import { SphereGeometry } from '../SphereGeometry';
import type { Geometry } from '../Geometry';

/**
 * Com `frontFace: 'ccw'` e `cullMode: 'back'`, a normal geométrica de cada triângulo
 * (regra da mão direita sobre a ordem dos índices) precisa apontar para o mesmo lado da
 * normal declarada nos vértices — senão a face visível é descartada.
 */
function misoriented(geometry: Geometry): number {
    const v = geometry.data.vertices as Float32Array;
    const idx = geometry.data.indices as Uint16Array;
    const at = (i: number, o: number): number => v[i * 8 + o]!;
    let bad = 0;
    for (let t = 0; t < idx.length; t += 3) {
        const [a, b, c] = [idx[t]!, idx[t + 1]!, idx[t + 2]!];
        const e1 = [at(b, 0) - at(a, 0), at(b, 1) - at(a, 1), at(b, 2) - at(a, 2)];
        const e2 = [at(c, 0) - at(a, 0), at(c, 1) - at(a, 1), at(c, 2) - at(a, 2)];
        const n = [
            e1[1]! * e2[2]! - e1[2]! * e2[1]!,
            e1[2]! * e2[0]! - e1[0]! * e2[2]!,
            e1[0]! * e2[1]! - e1[1]! * e2[0]!,
        ];
        const area2 = Math.hypot(n[0]!, n[1]!, n[2]!);
        if (area2 < 1e-9) continue; // triângulo degenerado (polos da esfera)
        const declared = [
            at(a, 3) + at(b, 3) + at(c, 3),
            at(a, 4) + at(b, 4) + at(c, 4),
            at(a, 5) + at(b, 5) + at(c, 5),
        ];
        if (n[0]! * declared[0]! + n[1]! * declared[1]! + n[2]! * declared[2]! <= 0) bad++;
    }
    return bad;
}

describe('orientação dos triângulos (ccw = face frontal)', () => {
    it.each([
        ['PlaneGeometry', () => new PlaneGeometry({ size: [4, 2] })],
        ['BoxGeometry', () => new BoxGeometry({ size: [1, 2, 3] })],
        ['SphereGeometry', () => new SphereGeometry({ radius: 1 })],
    ])('%s: normal geométrica concorda com a normal declarada', (_name, make) => {
        expect(misoriented(make())).toBe(0);
    });
});
