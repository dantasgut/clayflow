import type { GPUDescriptor } from '../../scene/descriptors/GPUDescriptor';
import { FieldType } from '../../scene/descriptors/FieldType';
import { StructSchema } from '../../scene/descriptors/StructSchema';
import { Geometry } from './Geometry';

export class PlaneGeometry extends Geometry {
    static readonly vertexStruct = new StructSchema('PlaneVertex', {
        position: FieldType.vec3f,
        normal: FieldType.vec3f,
        uv: FieldType.vec2f,
    });
    static readonly schema = PlaneGeometry.vertexStruct;

    constructor(values: Record<string, unknown> = {}) {
        super();
        const size = (values.size ?? [1, 1]) as readonly number[];
        const w = (size[0] ?? 1) / 2,
            h = (size[1] ?? 1) / 2;
        const vertices = new Float32Array([
            -w,
            0,
            -h,
            0,
            1,
            0,
            0,
            0,
            w,
            0,
            -h,
            0,
            1,
            0,
            1,
            0,
            w,
            0,
            h,
            0,
            1,
            0,
            1,
            1,
            -w,
            0,
            h,
            0,
            1,
            0,
            0,
            1,
        ]);
        const indices = new Uint16Array([0, 1, 2, 0, 2, 3]);
        this.data = { size, vertices, indices, vertexCount: 4, indexCount: 6 };
    }

    getDescriptors(): readonly GPUDescriptor[] {
        return [
            { id: 'vertices', role: 'vertex', schema: PlaneGeometry.vertexStruct, count: 4 },
            { id: 'indices', role: 'index', count: 6 },
        ];
    }

    get vertexCount(): number {
        return 4;
    }
    get indexCount(): number {
        return 6;
    }
}
