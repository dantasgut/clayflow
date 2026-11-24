import { describe, expect, it } from 'vitest';
import { MeshGeometry } from '../MeshGeometry';

// MeshGeometry (spec 011): a malha por arrays e a leitura do texto OBJ.
describe('MeshGeometry', () => {
    it('intercala posição, normal e uv; sem normais, a média pesada pela área', () => {
        const mesh = new MeshGeometry({
            positions: [0, 0, 0, 1, 0, 0, 0, 0, -1],
            indices: [0, 1, 2],
            uvs: [0, 0, 1, 0, 0, 1],
        });
        expect(mesh.vertexCount).toBe(3);
        expect(mesh.indexCount).toBe(3);
        expect(Array.from(mesh.data.vertices.subarray(8, 16))).toEqual([1, 0, 0, 0, 1, 0, 1, 0]);
        expect(mesh.contentKey).toBeTypeOf('string');
    });

    it('recusa tamanhos que não batem e índice fora dos vértices', () => {
        expect(() => new MeshGeometry({ positions: [0, 0, 0, 1], indices: [0, 1, 2] })).toThrow(
            RangeError,
        );
        const positions = [0, 0, 0, 1, 0, 0, 0, 1, 0];
        expect(() => new MeshGeometry({ positions, indices: [0, 1, 3] })).toThrow(RangeError);
        expect(() => new MeshGeometry({ positions, indices: [0, 1, 2], uvs: [0, 0] })).toThrow(
            RangeError,
        );
    });

    it('lê o OBJ: grupos, quadriláteros em leque, um vértice por par posição/uv, a face filtrada', () => {
        const obj = [
            'v 0 0 0',
            'v 1 0 0',
            'v 1 0 -1',
            'v 0 0 -1',
            'v 0 5 0',
            'vt 0 0',
            'vt 1 0',
            'vt 1 1',
            'vt 0 1',
            'g body',
            'f 1/1 2/2 3/3 4/4',
            'f 1/2 2/1 5/3',
            'g helper',
            'f 1/1 2/2 5/3',
        ].join('\n');
        const all = MeshGeometry.fromObj(obj, { groups: ['body'] });
        // O quadrilátero (4 vértices, 2 triângulos) e o triângulo com outros uvs nas mesmas posições (3 vértices).
        expect(all.vertexCount).toBe(7);
        expect(all.indexCount).toBe(9);
        const flat = MeshGeometry.fromObj(obj, {
            groups: ['body'],
            keep: (_x, y) => y < 1,
            scale: 2,
        });
        expect(flat.vertexCount).toBe(4);
        expect(Array.from(flat.data.vertices.subarray(8, 11))).toEqual([2, 0, 0]);
        // A normal é a da posição no arquivo inteiro lido: a mesma nos vértices repetidos na costura do uv.
        expect(Array.from(all.data.vertices.subarray(3, 6))).toEqual(
            Array.from(all.data.vertices.subarray(4 * 8 + 3, 4 * 8 + 6)),
        );
        expect(() => MeshGeometry.fromObj(obj, { groups: ['nada'] })).toThrow(RangeError);
    });
});
