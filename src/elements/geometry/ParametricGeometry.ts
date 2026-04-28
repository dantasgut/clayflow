import type { GPUDescriptor } from '../../scene/descriptors/GPUDescriptor';
import { FieldType } from '../../scene/descriptors/FieldType';
import { StructSchema } from '../../scene/descriptors/StructSchema';
import { Geometry } from './Geometry';

export type ParametricFunction = (u: number, v: number) => readonly [number, number, number];

export class ParametricGeometry extends Geometry {
    static readonly vertexStruct = new StructSchema('ParametricVertex', {
        position: FieldType.vec3f,
        normal: FieldType.vec3f,
        uv: FieldType.vec2f,
    });

    constructor(values: Record<string, unknown> = {}) {
        super();
        const fn = (values['fn'] ?? defaultFn) as ParametricFunction;
        const uSteps = (values['uSteps'] ?? 32) as number;
        const vSteps = (values['vSteps'] ?? 32) as number;
        const { vertices, indices } = sample(fn, uSteps, vSteps);
        this.data = {
            uSteps, vSteps, vertices, indices,
            vertexCount: vertices.length / 8,
            indexCount: indices.length,
        };
    }

    getDescriptors(): readonly GPUDescriptor[] {
        return [
            { id: 'vertices', role: 'vertex', schema: ParametricGeometry.vertexStruct, count: this.data['vertexCount'] as number },
            { id: 'indices', role: 'index', count: this.data['indexCount'] as number },
        ];
    }

    get vertexCount(): number { return this.data['vertexCount'] as number; }
    get indexCount(): number { return this.data['indexCount'] as number; }
}

const defaultFn: ParametricFunction = (u, v) => [u * 2 - 1, v * 2 - 1, 0];

function sample(fn: ParametricFunction, uSteps: number, vSteps: number): { vertices: Float32Array; indices: Uint16Array } {
    const verts: number[] = [];
    for (let i = 0; i <= vSteps; i++) {
        for (let j = 0; j <= uSteps; j++) {
            const u = j / uSteps, v = i / vSteps;
            const [x, y, z] = fn(u, v);
            verts.push(x, y, z, 0, 1, 0, u, v);
        }
    }
    const idx: number[] = [];
    const stride = uSteps + 1;
    for (let i = 0; i < vSteps; i++) {
        for (let j = 0; j < uSteps; j++) {
            const a = i * stride + j, b = a + 1, c = a + stride, d = c + 1;
            idx.push(a, c, b, b, c, d);
        }
    }
    return { vertices: new Float32Array(verts), indices: new Uint16Array(idx) };
}
