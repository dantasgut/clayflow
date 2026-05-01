import type { GPUDescriptor } from '../../scene/descriptors/GPUDescriptor';
import { FieldType } from '../../scene/descriptors/FieldType';
import { StructSchema } from '../../scene/descriptors/StructSchema';
import { Geometry } from './Geometry';

/**
 * Função paramétrica que mapeia coordenadas (u, v) ∈ [0,1]² → posição 3D.
 * Usada por `ParametricGeometry` para gerar superfícies (e.g. esfera,
 * torus, hélice) a partir de fórmulas matemáticas.
 *
 * @param u Coordenada paramétrica horizontal (0..1).
 * @param v Coordenada paramétrica vertical (0..1).
 * @returns Posição [x, y, z] em world coords.
 */
export type ParametricFunction = (u: number, v: number) => readonly [number, number, number];

/**
 * ParametricGeometry gera uma malha tessellated a partir de uma função
 * paramétrica `f(u, v) → [x, y, z]`. Útil para superfícies matemáticas
 * (sphere, torus, möbius, etc.) sem pré-computar mesh data.
 *
 * Subdivisão é controlada por `uSteps × vSteps` (default 32×32 = 1024 quads).
 * Normais são placeholder (always [0, 1, 0]) — apps que precisam de
 * shading correto devem post-processar com derivada cross-product.
 */
export class ParametricGeometry extends Geometry {
    /** Vertex layout: position (vec3) + normal (vec3) + uv (vec2). */
    static readonly vertexStruct = new StructSchema('ParametricVertex', {
        position: FieldType.vec3f,
        normal: FieldType.vec3f,
        uv: FieldType.vec2f,
    });
    /** Alias para vertexStruct — Schema interface comum. */
    static readonly schema = ParametricGeometry.vertexStruct;

    constructor(values: Record<string, unknown> = {}) {
        super();
        const fn = (values.fn ?? defaultFn) as ParametricFunction;
        const uSteps = (values.uSteps ?? 32) as number;
        const vSteps = (values.vSteps ?? 32) as number;
        const { vertices, indices } = sample(fn, uSteps, vSteps);
        this.data = {
            uSteps,
            vSteps,
            vertices,
            indices,
            vertexCount: vertices.length / 8,
            indexCount: indices.length,
        };
    }

    /** Declara VBO (vertex buffer) + IBO (index buffer) para o ResourceSystem. */
    getDescriptors(): readonly GPUDescriptor[] {
        return [
            {
                id: 'vertices',
                role: 'vertex',
                schema: ParametricGeometry.vertexStruct,
                count: this.data.vertexCount as number,
            },
            { id: 'indices', role: 'index', count: this.data.indexCount as number },
        ];
    }

    /** Número total de vértices (= (uSteps+1) × (vSteps+1)). */
    get vertexCount(): number {
        return this.data.vertexCount as number;
    }
    /** Número total de índices (= uSteps × vSteps × 6, 2 triangles por quad). */
    get indexCount(): number {
        return this.data.indexCount as number;
    }
}

const defaultFn: ParametricFunction = (u, v) => [u * 2 - 1, v * 2 - 1, 0];

function sample(
    fn: ParametricFunction,
    uSteps: number,
    vSteps: number,
): { vertices: Float32Array; indices: Uint16Array } {
    const verts: number[] = [];
    for (let i = 0; i <= vSteps; i++) {
        for (let j = 0; j <= uSteps; j++) {
            const u = j / uSteps,
                v = i / vSteps;
            const [x, y, z] = fn(u, v);
            verts.push(x, y, z, 0, 1, 0, u, v);
        }
    }
    const idx: number[] = [];
    const stride = uSteps + 1;
    for (let i = 0; i < vSteps; i++) {
        for (let j = 0; j < uSteps; j++) {
            const a = i * stride + j,
                b = a + 1,
                c = a + stride,
                d = c + 1;
            idx.push(a, c, b, b, c, d);
        }
    }
    return { vertices: new Float32Array(verts), indices: new Uint16Array(idx) };
}
