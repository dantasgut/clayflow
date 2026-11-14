import { describe, expect, it } from 'vitest';
import { GraphGeometry } from '../GraphGeometry';
import { MeshVertexSchema } from '../MeshVertexSchema';
import { SurfaceGeometry } from '../SurfaceGeometry';

describe('MeshVertex e GraphGeometry (spec 031, T070)', () => {
    it('MeshVertex: 8 f32 escalares = 32 B, com o layout do vértice de desenho', () => {
        expect(MeshVertexSchema.stride).toBe(32);
        const layout = SurfaceGeometry.vertexStruct.vertexLayout;
        expect(layout.stride).toBe(32);
        const at = (name: string): number => layout.attributes.find((a) => a.name === name)!.offset;
        expect(MeshVertexSchema.offsetOf('px')).toBe(at('position'));
        expect(MeshVertexSchema.offsetOf('nx')).toBe(at('normal'));
        expect(MeshVertexSchema.offsetOf('u')).toBe(at('uv'));
        expect(MeshVertexSchema.offsetOf('v')).toBe(28);
    });

    it('GraphGeometry: vértices, índices, arame e indireto escritos só pela GPU, com as capacidades', () => {
        const g = new GraphGeometry({ vertexCapacity: 100, indexCapacity: 300, edgeCapacity: 50 });
        const d = Object.fromEntries(g.getDescriptors().map((x) => [x.id, x]));
        expect(Object.keys(d)).toEqual([
            'vertices',
            'indices',
            'wireEdges',
            'indirect',
            'previousVertices',
        ]);
        for (const x of Object.values(d)) expect(x.upload).toBe('never');
        expect(d.vertices).toMatchObject({
            role: 'vertex',
            count: 100,
            schema: SurfaceGeometry.vertexStruct,
        });
        expect(d.indices).toMatchObject({ role: 'index', count: 300, indexFormat: 'uint32' });
        expect(d.wireEdges).toMatchObject({ role: 'index', count: 100 });
        expect(d.indirect).toMatchObject({ role: 'indirect', count: 2 });
        expect(g.contentKey).toBeUndefined();
        expect(g.indexFormat).toBe('uint32');
        expect(
            new GraphGeometry({ vertexCapacity: 3, indexCapacity: 3 })
                .getDescriptors()
                .map((x) => x.id),
        ).toEqual(['vertices', 'indices', 'indirect', 'previousVertices']);
        expect(() => new GraphGeometry({ vertexCapacity: 3, indexCapacity: 4 })).toThrow(
            /múltiplo de 3/,
        );
        expect(() => new GraphGeometry({ vertexCapacity: 0, indexCapacity: 3 })).toThrow(
            RangeError,
        );
    });
});
