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

    it('subdivide por Catmull-Clark: o cubo de 6 faces vira 24 e depois 96 quadriláteros, encolhendo para a esfera', () => {
        const cube = [
            'v -1 -1 -1',
            'v 1 -1 -1',
            'v 1 1 -1',
            'v -1 1 -1',
            'v -1 -1 1',
            'v 1 -1 1',
            'v 1 1 1',
            'v -1 1 1',
            'f 1 4 3 2',
            'f 5 6 7 8',
            'f 1 2 6 5',
            'f 2 3 7 6',
            'f 3 4 8 7',
            'f 4 1 5 8',
        ].join('\n');
        const radius = (mesh: MeshGeometry): [number, number] => {
            let [low, high] = [Infinity, 0];
            for (let i = 0; i < mesh.vertexCount; i++) {
                const r = Math.hypot(...mesh.data.vertices.subarray(i * 8, i * 8 + 3));
                low = Math.min(low, r);
                high = Math.max(high, r);
            }
            return [low, high];
        };
        const once = MeshGeometry.fromObj(cube, { subdivide: 1 });
        // 8 cantos + 6 pontos de face + 12 de aresta; 24 quadriláteros em dois triângulos cada.
        expect(once.vertexCount).toBe(26);
        expect(once.indexCount).toBe(24 * 6);
        const twice = MeshGeometry.fromObj(cube, { subdivide: 2 });
        expect(twice.indexCount).toBe(96 * 6);
        // O canto do cubo (√3) vai para dentro e a malha aproxima a esfera: os raios ficam numa faixa estreita.
        const [low, high] = radius(twice);
        expect(high).toBeLessThan(1.35);
        expect(high / low).toBeLessThan(1.25);
        // Fechada: nenhuma aresta de borda (cada aresta em dois triângulos).
        const seen = new Map<string, number>();
        const index = twice.data.indices;
        for (let t = 0; t < index.length; t += 3) {
            for (let e = 0; e < 3; e++) {
                const [a, b] = [index[t + e]!, index[t + ((e + 1) % 3)]!];
                const key = a < b ? `${a}/${b}` : `${b}/${a}`;
                seen.set(key, (seen.get(key) ?? 0) + 1);
            }
        }
        expect([...seen.values()].every((n) => n === 2)).toBe(true);
    });

    it('refined: divide só a região, sem vértice no meio de aresta alheia, e não muda a forma', () => {
        // Dois triângulos que partilham a aresta (1, 2); só o primeiro está na região.
        const mesh = new MeshGeometry({
            positions: [0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0],
            indices: [0, 1, 2, 2, 1, 3],
        });
        const fine = mesh.refined(1, (x, y) => x + y < 0.9);
        // O primeiro vira 4; o vizinho divide só a aresta partilhada (2).
        expect(fine.data.indexCount / 3).toBe(6);
        expect(fine.data.vertexCount).toBe(7);
        // Toda aresta interna aparece em dois triângulos: nenhuma fresta.
        const uses = new Map<string, number>();
        const ix = fine.data.indices;
        for (let t = 0; t < ix.length; t += 3)
            for (let k = 0; k < 3; k++) {
                const [a, b] = [ix[t + k]!, ix[t + ((k + 1) % 3)]!];
                const key = a < b ? `${a}-${b}` : `${b}-${a}`;
                uses.set(key, (uses.get(key) ?? 0) + 1);
            }
        expect([...uses.values()].filter((n) => n > 2)).toEqual([]);
        expect([...uses.values()].filter((n) => n === 1).length).toBe(6);
        // Tudo no plano z = 0, normais +z.
        for (let i = 0; i < fine.data.vertexCount; i++) {
            expect(fine.data.vertices[i * 8 + 2]).toBe(0);
            expect(fine.data.vertices[i * 8 + 5]).toBeCloseTo(1, 6);
        }
        expect(mesh.refined(0, () => true).data.vertexCount).toBe(4);
        expect(() => mesh.refined(9, () => true)).toThrow(RangeError);
    });
});
