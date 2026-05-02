import type { GPUDescriptor } from '../../scene/descriptors/GPUDescriptor';
import { FieldType } from '../../scene/descriptors/FieldType';
import { StructSchema } from '../../scene/descriptors/StructSchema';
import { Geometry } from './Geometry';

/**
 * PlaneGeometry — quad plano em XZ (normal +Y) com `size: [w, h]`.
 * 4 vertices + 6 indices (1 quad = 2 triangles). Útil para chão,
 * shadow receivers, water surface.
 */
export class PlaneGeometry extends Geometry {
    /** Vertex layout: position + normal + uv. */
    static readonly vertexStruct = new StructSchema('PlaneVertex', {
        position: FieldType.vec3f,
        normal: FieldType.vec3f,
        uv: FieldType.vec2f,
    });
    /** Alias para vertexStruct. */
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

    /** Declara VBO + IBO. */
    getDescriptors(): readonly GPUDescriptor[] {
        return [
            { id: 'vertices', role: 'vertex', schema: PlaneGeometry.vertexStruct, count: 4 },
            { id: 'indices', role: 'index', count: 6 },
        ];
    }

    /** = 4 (4 cantos do quad). */
    get vertexCount(): number {
        return 4;
    }
    /** = 6 (2 triangles × 3 indices). */
    get indexCount(): number {
        return 6;
    }
}
