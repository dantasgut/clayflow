// Referências em CPU dos nós de conjunto da C3 (spec 031, US3): a mesma regra em f64 — a mesma ordem de elementos, os
// mesmos hashes inteiros e as mesmas decisões —, para os testes e o smoke `nodeGraphs` (parte b) compararem com a GPU.
import { hash3 } from './noise';

/** Malha de referência: 8 números por vértice (posição, normal, uv — o layout `MeshVertex`) e 3 índices por triângulo. */
export interface ReferenceMesh {
    readonly vertices: Float64Array;
    readonly triangles: Uint32Array;
}

/** Pontos de referência: 6 números por ponto (posição, normal — o layout `SetPoint`). */
export interface ReferencePoints {
    readonly points: Float64Array;
    /**
     * Menor |hash − densidade| entre os candidatos: a folga da decisão de aceite (abaixo de ~1e-6 a GPU, em f32, pode
     * decidir diferente).
     */
    readonly margin: number;
}

/** Campo por elemento das entradas de ponto (`height`, `density`): posição, normal e uv. */
export type VertexField = (
    position: readonly [number, number, number],
    normal: readonly [number, number, number],
    uv: readonly [number, number],
) => number;

/** `set.grid`: (v, 0, u), normal +y, uv; triângulos (a, b, c), (b, d, c) por célula. */
export function grid(nu: number, nv: number, sizeU: number, sizeV: number): ReferenceMesh {
    const vertices = new Float64Array(nu * nv * 8);
    for (let i = 0; i < nu * nv; i++) {
        const su = (i % nu) / (nu - 1);
        const sv = Math.floor(i / nu) / (nv - 1);
        vertices.set([(sv - 0.5) * sizeV, 0, (su - 0.5) * sizeU, 0, 1, 0, su, sv], i * 8);
    }
    const cells = (nu - 1) * (nv - 1);
    const triangles = new Uint32Array(cells * 6);
    for (let i = 0; i < cells; i++) {
        const a = Math.floor(i / (nu - 1)) * nu + (i % (nu - 1));
        const b = a + 1;
        const c = a + nu;
        const d = c + 1;
        triangles.set([a, b, c, b, d, c], i * 6);
    }
    return { vertices, triangles };
}

const position = (v: Float64Array, k: number): [number, number, number] => [
    v[k * 8]!,
    v[k * 8 + 1]!,
    v[k * 8 + 2]!,
];
const normal = (v: Float64Array, k: number): [number, number, number] => [
    v[k * 8 + 3]!,
    v[k * 8 + 4]!,
    v[k * 8 + 5]!,
];
const uvOf = (v: Float64Array, k: number): [number, number] => [v[k * 8 + 6]!, v[k * 8 + 7]!];

/** `set.displace`: p + n · scale · height(p, n, uv). */
export function displace(mesh: ReferenceMesh, height: VertexField, scale: number): ReferenceMesh {
    const vertices = Float64Array.from(mesh.vertices);
    for (let k = 0; k < vertices.length / 8; k++) {
        const p = position(mesh.vertices, k);
        const n = normal(mesh.vertices, k);
        const h = scale * height(p, n, uvOf(mesh.vertices, k));
        for (let j = 0; j < 3; j++) vertices[k * 8 + j] = p[j]! + n[j]! * h;
    }
    return { vertices, triangles: mesh.triangles };
}

/** `set.recomputeNormals`: média normalizada das normais unitárias das faces adjacentes; sem face, a de entrada. */
export function recomputeNormals(mesh: ReferenceMesh): ReferenceMesh {
    const v = mesh.vertices;
    const count = v.length / 8;
    const sum = new Float64Array(count * 3);
    const t = mesh.triangles;
    for (let i = 0; i + 2 < t.length; i += 3) {
        const [a, b, c] = [t[i]!, t[i + 1]!, t[i + 2]!];
        if (Math.max(a, b, c) >= count) continue;
        const pa = position(v, a);
        const pb = position(v, b);
        const pc = position(v, c);
        const e1 = [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]];
        const e2 = [pc[0] - pa[0], pc[1] - pa[1], pc[2] - pa[2]];
        const f = [
            e1[1]! * e2[2]! - e1[2]! * e2[1]!,
            e1[2]! * e2[0]! - e1[0]! * e2[2]!,
            e1[0]! * e2[1]! - e1[1]! * e2[0]!,
        ];
        const len = Math.hypot(f[0]!, f[1]!, f[2]!);
        if (!(len > 0)) continue;
        for (const k of [a, b, c]) for (let j = 0; j < 3; j++) sum[k * 3 + j]! += f[j]! / len;
    }
    const vertices = Float64Array.from(v);
    for (let k = 0; k < count; k++) {
        const len = Math.hypot(sum[k * 3]!, sum[k * 3 + 1]!, sum[k * 3 + 2]!);
        if (!(len > 0)) continue;
        for (let j = 0; j < 3; j++) vertices[k * 8 + 3 + j] = sum[k * 3 + j]! / len;
    }
    return { vertices, triangles: mesh.triangles };
}

/** Os 24 bits altos do hash em [0, 1) (`set_hash_unit`). */
export function hashUnit(h: number): number {
    return (h >>> 8) / 16777216;
}

/**
 * `set.distributeOnMesh`: candidatos (t, k) em ordem, baricêntricas s = √r₁, w = (1 − s, s(1 − r₂), s·r₂) pelos hashes
 * (semente, t, 3k) e (semente, t, 3k + 1), aceitos quando o hash (semente, t, 3k + 2) fica abaixo da densidade presa
 * em [0, 1].
 */
export function distributeOnMesh(
    mesh: ReferenceMesh,
    density: VertexField,
    perTriangle: number,
    seed: number,
): ReferencePoints {
    const v = mesh.vertices;
    const t = mesh.triangles;
    const out: number[] = [];
    let margin = Infinity;
    for (let tri = 0; tri < t.length / 3; tri++) {
        const ids = [t[tri * 3]!, t[tri * 3 + 1]!, t[tri * 3 + 2]!];
        for (let k = 0; k < perTriangle; k++) {
            const r1 = hashUnit(hash3(seed >>> 0, tri, 3 * k));
            const r2 = hashUnit(hash3(seed >>> 0, tri, 3 * k + 1));
            const s = Math.sqrt(r1);
            const w = [1 - s, s * (1 - r2), s * r2];
            const p: [number, number, number] = [0, 0, 0];
            const m: [number, number, number] = [0, 0, 0];
            const uv: [number, number] = [0, 0];
            ids.forEach((id, j) => {
                for (let q = 0; q < 3; q++) {
                    p[q] = p[q]! + w[j]! * v[id * 8 + q]!;
                    m[q] = m[q]! + w[j]! * v[id * 8 + 3 + q]!;
                }
                uv[0] += w[j]! * v[id * 8 + 6]!;
                uv[1] += w[j]! * v[id * 8 + 7]!;
            });
            const len = Math.hypot(...m);
            const n: [number, number, number] =
                len > 0 ? [m[0] / len, m[1] / len, m[2] / len] : [0, 1, 0];
            const d = Math.min(1, Math.max(0, density(p, n, uv)));
            const h = hashUnit(hash3(seed >>> 0, tri, 3 * k + 2));
            margin = Math.min(margin, Math.abs(h - d));
            if (h < d) out.push(...p, ...n);
        }
    }
    return { points: Float64Array.from(out), margin };
}

/** Tabela da esfera de `set.realizeInstances` em f64: (sen θ, cos θ) por anel e (cos φ, sen φ) por segmento. */
function sphereTable(segments: number, rings: number): { theta: number[][]; phi: number[][] } {
    const theta: number[][] = [];
    const phi: number[][] = [];
    for (let r = 0; r <= rings; r++)
        theta.push([Math.sin((Math.PI * r) / rings), Math.cos((Math.PI * r) / rings)]);
    for (let s = 0; s <= segments; s++)
        phi.push([Math.cos((2 * Math.PI * s) / segments), Math.sin((2 * Math.PI * s) / segments)]);
    return { theta, phi };
}

/** `set.realizeInstances`: uma esfera UV por ponto; triângulos (a, b, c), (b, d, c) por célula. */
export function realizeInstances(
    points: Float64Array,
    radius: number,
    segments: number,
    rings: number,
): ReferenceMesh {
    const count = points.length / 6;
    const columns = segments + 1;
    const perVertex = columns * (rings + 1);
    const { theta, phi } = sphereTable(segments, rings);
    const vertices = new Float64Array(count * perVertex * 8);
    const triangles = new Uint32Array(count * segments * rings * 6);
    for (let p = 0; p < count; p++) {
        for (let r = 0; r <= rings; r++) {
            for (let s = 0; s <= segments; s++) {
                const [st, ct] = theta[r]!;
                const [cp, sp] = phi[s]!;
                const d = [st! * cp!, ct!, st! * sp!];
                const i = p * perVertex + r * columns + s;
                vertices.set(
                    [
                        points[p * 6]! + radius * d[0]!,
                        points[p * 6 + 1]! + radius * d[1]!,
                        points[p * 6 + 2]! + radius * d[2]!,
                        d[0]!,
                        d[1]!,
                        d[2]!,
                        s / segments,
                        r / rings,
                    ],
                    i * 8,
                );
            }
        }
        for (let cell = 0; cell < segments * rings; cell++) {
            const a = p * perVertex + Math.floor(cell / segments) * columns + (cell % segments);
            const b = a + 1;
            const c = a + columns;
            const d = c + 1;
            triangles.set([a, b, c, b, d, c], (p * segments * rings + cell) * 6);
        }
    }
    return { vertices, triangles };
}

/** `set.prefixSum`: exclusiva (ou inclusiva), u32 com estouro modular. */
export function prefixSum(values: ArrayLike<number>, inclusive = false): Uint32Array {
    const out = new Uint32Array(values.length);
    let acc = 0;
    for (let i = 0; i < values.length; i++) {
        if (inclusive) acc = (acc + values[i]!) >>> 0;
        out[i] = acc;
        if (!inclusive) acc = (acc + values[i]!) >>> 0;
    }
    return out;
}

/** `set.sort`: crescente pelos `bits` menos significativos, estável. */
export function sort(values: ArrayLike<number>, bits = 32): Uint32Array {
    const mask = bits >= 32 ? 0xffffffff : (1 << bits) - 1;
    return Uint32Array.from(
        Array.from(values, (v, i) => [v >>> 0, i] as const)
            .sort((x, y) => ((x[0] & mask) >>> 0) - ((y[0] & mask) >>> 0) || x[1] - y[1])
            .map(([v]) => v),
    );
}

/** `set.compact`: índices dos não nulos, em ordem. */
export function compact(values: ArrayLike<number>): Uint32Array {
    const out: number[] = [];
    for (let i = 0; i < values.length; i++) if (values[i] !== 0) out.push(i);
    return Uint32Array.from(out);
}

/** `set.reduce`: soma (u32 modular), mínimo ou máximo; vazio → 0. */
export function reduce(values: ArrayLike<number>, op: 'sum' | 'min' | 'max'): number {
    if (values.length === 0) return 0;
    let acc = op === 'sum' ? 0 : values[0]! >>> 0;
    for (let i = op === 'sum' ? 0 : 1; i < values.length; i++) {
        const v = values[i]! >>> 0;
        acc = op === 'sum' ? (acc + v) >>> 0 : op === 'min' ? Math.min(acc, v) : Math.max(acc, v);
    }
    return acc;
}

/** `set.sequence`: `start + i · step` (u32 modular). */
export function sequence(count: number, start: number, step: number): Uint32Array {
    return Uint32Array.from({ length: count }, (_, i) => (start + Math.imul(i, step)) >>> 0);
}
