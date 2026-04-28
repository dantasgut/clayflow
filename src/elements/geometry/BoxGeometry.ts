import type { GPUDescriptor } from '../../scene/descriptors/GPUDescriptor';
import { FieldType } from '../../scene/descriptors/FieldType';
import { StructSchema } from '../../scene/descriptors/StructSchema';
import { Geometry } from './Geometry';

export class BoxGeometry extends Geometry {
    static readonly vertexStruct = new StructSchema('BoxVertex', {
        position: FieldType.vec3f,
        normal: FieldType.vec3f,
        uv: FieldType.vec2f,
    });

    constructor(values: Record<string, unknown> = {}) {
        super();
        const size = (values['size'] ?? [1, 1, 1]) as readonly number[];
        const sx = (size[0] ?? 1) / 2, sy = (size[1] ?? 1) / 2, sz = (size[2] ?? 1) / 2;
        const verts = generateBox(sx, sy, sz);
        const indices = boxIndices();
        this.data = {
            size,
            vertices: verts,
            indices,
            vertexCount: verts.length / 8,
            indexCount: indices.length,
        };
    }

    getDescriptors(): readonly GPUDescriptor[] {
        return [
            { id: 'vertices', role: 'vertex', schema: BoxGeometry.vertexStruct, count: this.data['vertexCount'] as number },
            { id: 'indices', role: 'index', count: this.data['indexCount'] as number },
        ];
    }

    get vertexCount(): number { return this.data['vertexCount'] as number; }
    get indexCount(): number { return this.data['indexCount'] as number; }
}

function generateBox(sx: number, sy: number, sz: number): Float32Array {
    const v = (px: number, py: number, pz: number, nx: number, ny: number, nz: number, u: number, vv: number) =>
        [px, py, pz, nx, ny, nz, u, vv];
    const data: number[] = [
        ...v(-sx, -sy,  sz, 0, 0, 1, 0, 0), ...v( sx, -sy,  sz, 0, 0, 1, 1, 0),
        ...v( sx,  sy,  sz, 0, 0, 1, 1, 1), ...v(-sx,  sy,  sz, 0, 0, 1, 0, 1),
        ...v( sx, -sy, -sz, 0, 0,-1, 0, 0), ...v(-sx, -sy, -sz, 0, 0,-1, 1, 0),
        ...v(-sx,  sy, -sz, 0, 0,-1, 1, 1), ...v( sx,  sy, -sz, 0, 0,-1, 0, 1),
        ...v(-sx,  sy,  sz, 0, 1, 0, 0, 0), ...v( sx,  sy,  sz, 0, 1, 0, 1, 0),
        ...v( sx,  sy, -sz, 0, 1, 0, 1, 1), ...v(-sx,  sy, -sz, 0, 1, 0, 0, 1),
        ...v(-sx, -sy, -sz, 0,-1, 0, 0, 0), ...v( sx, -sy, -sz, 0,-1, 0, 1, 0),
        ...v( sx, -sy,  sz, 0,-1, 0, 1, 1), ...v(-sx, -sy,  sz, 0,-1, 0, 0, 1),
        ...v( sx, -sy,  sz, 1, 0, 0, 0, 0), ...v( sx, -sy, -sz, 1, 0, 0, 1, 0),
        ...v( sx,  sy, -sz, 1, 0, 0, 1, 1), ...v( sx,  sy,  sz, 1, 0, 0, 0, 1),
        ...v(-sx, -sy, -sz,-1, 0, 0, 0, 0), ...v(-sx, -sy,  sz,-1, 0, 0, 1, 0),
        ...v(-sx,  sy,  sz,-1, 0, 0, 1, 1), ...v(-sx,  sy, -sz,-1, 0, 0, 0, 1),
    ];
    return new Float32Array(data);
}

function boxIndices(): Uint16Array {
    const idx: number[] = [];
    for (let f = 0; f < 6; f++) {
        const o = f * 4;
        idx.push(o, o + 1, o + 2,  o, o + 2, o + 3);
    }
    return new Uint16Array(idx);
}
