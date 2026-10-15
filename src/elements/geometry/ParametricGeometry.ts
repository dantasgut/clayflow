import type { GPUDescriptor } from '../../scene/descriptors/GPUDescriptor';
import { FieldType } from '../../scene/descriptors/FieldType';
import { StructSchema } from '../../scene/descriptors/StructSchema';
import { Geometry, type GeometryData } from './Geometry';
import { functionId, sharedContent } from './geometryContent';

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

/** Dado de uma `ParametricGeometry`. */
export interface ParametricGeometryData extends GeometryData {
    /** Número de vértices. */
    vertexCount: number;
    /** Número de índices. */
    indexCount: number;
    /** Divisões em u. */
    uSteps: number;
    /** Divisões em v. */
    vSteps: number;
}

/**
 * ParametricGeometry gera uma malha tessellated a partir de uma função
 * paramétrica `f(u, v) → [x, y, z]`. Útil para superfícies matemáticas
 * (sphere, torus, möbius, etc.) sem pré-computar mesh data.
 *
 * Subdivisão é controlada por `uSteps × vSteps` (default 32×32 = 1024 quads).
 * Normais por diferenças centrais da própria função (spec 010): `normalize(∂f/∂v × ∂f/∂u)`, o lado da frente dos
 * triângulos (enrolamento `a, c, b`); uma só lateral nas bordas do domínio e recuo para dentro em pontos degenerados
 * (polos). Para superfícies avaliadas na GPU (derivadas analíticas, animação, geometria diferencial), prefira a
 * `ParametricSurface`.
 */
export class ParametricGeometry extends Geometry<ParametricGeometryData> {
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
        // Mesma função (identidade) e mesma subdivisão → mesmos arrays.
        const key = `ParametricGeometry:fn${functionId(fn)}:${uSteps}x${vSteps}`;
        const { vertices, indices, wireEdges } = sharedContent(key, () => {
            const sampled = sample(fn, uSteps, vSteps);
            return {
                vertices: sampled.vertices,
                indices: Geometry.indexArray(sampled.indices, sampled.vertices.length / 8),
            };
        });
        this.data = {
            uSteps,
            vSteps,
            vertices,
            indices,
            vertexCount: vertices.length / 8,
            indexCount: indices.length,
            wireEdges,
        };
    }

    /** Declara VBO (vertex buffer) + IBO (index buffer) para o ResourceSystem. */
    getDescriptors(): readonly GPUDescriptor[] {
        return [
            {
                id: 'vertices',
                role: 'vertex',
                schema: ParametricGeometry.vertexStruct,
                count: this.data.vertexCount,
            },
            { id: 'indices', role: 'index', count: this.data.indexCount },
            ...this.wireDescriptors(),
        ];
    }

    /** Número total de vértices (= (uSteps+1) × (vSteps+1)). */
    get vertexCount(): number {
        return this.data.vertexCount;
    }
    /** Número total de índices (= uSteps × vSteps × 6, 2 triangles por quad). */
    get indexCount(): number {
        return this.data.indexCount;
    }
}

const defaultFn: ParametricFunction = (u, v) => [u * 2 - 1, v * 2 - 1, 0];

function sample(
    fn: ParametricFunction,
    uSteps: number,
    vSteps: number,
): { vertices: Float32Array; indices: number[] } {
    const verts: number[] = [];
    for (let i = 0; i <= vSteps; i++) {
        for (let j = 0; j <= uSteps; j++) {
            const u = j / uSteps,
                v = i / vSteps;
            const [x, y, z] = fn(u, v);
            const [nx, ny, nz] = normalAt(fn, u, v);
            verts.push(x, y, z, nx, ny, nz, u, v);
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
    return { vertices: new Float32Array(verts), indices: idx };
}

/** Passo das diferenças em (u, v) ∈ [0, 1]². */
const H = 1e-4;

/** Derivada de `fn` na direção `axis` (0 = u, 1 = v): central, ou de uma só lateral na borda do domínio. */
function derivative(fn: ParametricFunction, u: number, v: number, axis: 0 | 1): number[] {
    const at = (t: number): readonly [number, number, number] => (axis === 0 ? fn(t, v) : fn(u, t));
    const t = axis === 0 ? u : v;
    const lo = Math.max(0, t - H);
    const hi = Math.min(1, t + H);
    const a = at(lo);
    const b = at(hi);
    return [0, 1, 2].map((k) => (b[k]! - a[k]!) / (hi - lo));
}

/**
 * Normal do lado da frente em (u, v): `normalize(∂f/∂v × ∂f/∂u)`. Ponto degenerado (polo: uma derivada some) usa as
 * derivadas de um pouco para dentro do domínio em v e depois em u; sem nenhuma, `[0, 1, 0]`.
 */
function normalAt(fn: ParametricFunction, u: number, v: number): [number, number, number] {
    const tries: [number, number][] = [
        [u, v],
        [u, v < 0.5 ? v + 1e-3 : v - 1e-3],
        [u < 0.5 ? u + 1e-3 : u - 1e-3, v],
    ];
    for (const [pu, pv] of tries) {
        const du = derivative(fn, pu, pv, 0);
        const dv = derivative(fn, pu, pv, 1);
        const n = [
            dv[1]! * du[2]! - dv[2]! * du[1]!,
            dv[2]! * du[0]! - dv[0]! * du[2]!,
            dv[0]! * du[1]! - dv[1]! * du[0]!,
        ];
        const len = Math.hypot(n[0]!, n[1]!, n[2]!);
        const scale = Math.hypot(...du) * Math.hypot(...dv);
        if (Number.isFinite(len) && len > 1e-9 * Math.max(scale, 1e-30))
            return [n[0]! / len, n[1]! / len, n[2]! / len];
    }
    return [0, 1, 0];
}
