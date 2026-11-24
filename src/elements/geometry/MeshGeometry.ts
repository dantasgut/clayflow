import type { GPUDescriptor } from '../../scene/descriptors/GPUDescriptor';
import { FieldType } from '../../scene/descriptors/FieldType';
import { StructSchema } from '../../scene/descriptors/StructSchema';
import { Geometry, type GeometryData } from './Geometry';
import { triangleEdges } from './geometryContent';

/** Dado de uma `MeshGeometry`. */
export interface MeshGeometryData extends GeometryData {
    /** Vértices intercalados (posição, normal, uv; 8 floats). */
    vertices: Float32Array;
    /** Triângulos (índices de vértice). */
    indices: Uint16Array | Uint32Array;
    /** Número de vértices. */
    vertexCount: number;
    /** Número de índices. */
    indexCount: number;
}

/** Os arrays de uma malha: posições, triângulos e, opcionais, normais e uvs por vértice. */
export interface MeshGeometryValues {
    /** Posições (`x, y, z` por vértice). */
    readonly positions: ArrayLike<number>;
    /** Triângulos (3 índices por triângulo, sentido anti-horário visto de fora). */
    readonly indices: ArrayLike<number>;
    /** Normais (`x, y, z` por vértice). Sem elas: a média das normais dos triângulos, pesada pela área. */
    readonly normals?: ArrayLike<number>;
    /** Coordenadas de superfície (`u, v` por vértice). Sem elas: zero. */
    readonly uvs?: ArrayLike<number>;
}

/** O que ler de um texto OBJ. */
export interface ObjOptions {
    /** Os grupos (`g`) a ler. Sem a opção: todos. */
    readonly groups?: readonly string[];
    /** Fica a face cujo centro (já com `scale` e `offset`) passa no teste. Sem a opção: todas. */
    readonly keep?: (x: number, y: number, z: number) => boolean;
    /** Multiplica as posições (1). */
    readonly scale?: number;
    /** Soma às posições, depois da escala ((0, 0, 0)). */
    readonly offset?: readonly [number, number, number];
    /**
     * Níveis de subdivisão de Catmull-Clark antes de triangular (0): cada nível troca cada face por um quadrilátero por
     * canto e alisa as posições — a malha de poucas faces (a base de um modelador) fica lisa na silhueta e nas dobras.
     * Cada nível multiplica as faces por cerca de quatro.
     */
    readonly subdivide?: number;
}

/** Um canto de face: os índices da posição e do uv. */
interface ObjCorner {
    readonly p: number;
    readonly t: number;
}

/**
 * MeshGeometry — malha de triângulos dada por arrays: o modelo feito fora do motor (esculpido, escaneado, exportado de
 * outro programa). Os vértices vão intercalados (posição, normal, uv) e são desenhados, sombreados e traçados como os
 * das geometrias prontas; o conteúdo é deduplicado pelo hash dos bytes. `MeshGeometry.fromObj` lê o texto de um arquivo
 * Wavefront OBJ.
 */
export class MeshGeometry extends Geometry<MeshGeometryData> {
    /** Layout do vértice: posição, normal e uv. */
    static readonly vertexStruct = new StructSchema('MeshGeometryVertex', {
        position: FieldType.vec3f,
        normal: FieldType.vec3f,
        uv: FieldType.vec2f,
    });
    /** Alias para vertexStruct. */
    static readonly schema = MeshGeometry.vertexStruct;

    /**
     * @throws RangeError se os tamanhos não batem ou um índice está fora dos vértices.
     */
    constructor(values: MeshGeometryValues) {
        super();
        const { positions, indices: triangles, normals, uvs } = values;
        const n = positions.length / 3;
        if (!Number.isInteger(n) || n < 3) {
            throw new RangeError(
                `MeshGeometry: positions tem ${positions.length} valores — são 3 por vértice, ao menos 3 vértices.`,
            );
        }
        if (triangles.length < 3 || triangles.length % 3 !== 0) {
            throw new RangeError(
                `MeshGeometry: indices tem ${triangles.length} valores — são 3 por triângulo, ao menos um.`,
            );
        }
        if (normals !== undefined && normals.length !== n * 3) {
            throw new RangeError(
                `MeshGeometry: normals tem ${normals.length} valores; com ${n} vértices são ${n * 3}.`,
            );
        }
        if (uvs !== undefined && uvs.length !== n * 2) {
            throw new RangeError(
                `MeshGeometry: uvs tem ${uvs.length} valores; com ${n} vértices são ${n * 2}.`,
            );
        }
        const list = Array.from(triangles);
        list.forEach((v, k) => {
            if (!Number.isInteger(v) || v < 0 || v >= n) {
                throw new RangeError(`MeshGeometry: indices[${k}] = ${v} fora dos ${n} vértices.`);
            }
        });
        const indices = Geometry.indexArray(list, n);
        const smooth = normals ?? MeshGeometry.smoothNormals(positions, indices);
        const vertices = new Float32Array(n * 8);
        for (let i = 0; i < n; i++) {
            vertices.set(
                [
                    positions[i * 3]!,
                    positions[i * 3 + 1]!,
                    positions[i * 3 + 2]!,
                    smooth[i * 3]!,
                    smooth[i * 3 + 1]!,
                    smooth[i * 3 + 2]!,
                    uvs?.[i * 2] ?? 0,
                    uvs?.[i * 2 + 1] ?? 0,
                ],
                i * 8,
            );
        }
        this.data = {
            vertices,
            indices,
            vertexCount: n,
            indexCount: indices.length,
            wireEdges: triangleEdges(indices),
        };
    }

    /** As normais por vértice: a soma das normais dos triângulos do vértice, pesada pela área, normalizada. */
    private static smoothNormals(
        positions: ArrayLike<number>,
        indices: ArrayLike<number>,
    ): Float32Array {
        const out = new Float32Array(positions.length);
        for (let t = 0; t < indices.length; t += 3) {
            const [a, b, c] = [indices[t]! * 3, indices[t + 1]! * 3, indices[t + 2]! * 3];
            const ux = positions[b]! - positions[a]!;
            const uy = positions[b + 1]! - positions[a + 1]!;
            const uz = positions[b + 2]! - positions[a + 2]!;
            const vx = positions[c]! - positions[a]!;
            const vy = positions[c + 1]! - positions[a + 1]!;
            const vz = positions[c + 2]! - positions[a + 2]!;
            const nx = uy * vz - uz * vy;
            const ny = uz * vx - ux * vz;
            const nz = ux * vy - uy * vx;
            for (const i of [a, b, c]) {
                out[i]! += nx;
                out[i + 1]! += ny;
                out[i + 2]! += nz;
            }
        }
        for (let i = 0; i < out.length; i += 3) {
            const l = Math.hypot(out[i]!, out[i + 1]!, out[i + 2]!);
            if (l > 0) {
                out[i]! /= l;
                out[i + 1]! /= l;
                out[i + 2]! /= l;
            } else out[i + 1] = 1;
        }
        return out;
    }

    /**
     * A malha de um texto Wavefront OBJ: as posições (`v`), os uvs (`vt`) e as faces (`f`, triângulos, quadriláteros ou
     * polígonos convexos, divididos em leque), dos grupos pedidos. Um vértice por par posição/uv; as normais são as
     * médias por posição (a costura do uv não quebra o sombreamento). As normais (`vn`) e os materiais do arquivo não
     * são lidos.
     * @throws RangeError se nenhuma face sobra.
     */
    static fromObj(text: string, options: ObjOptions = {}): MeshGeometry {
        const scale = options.scale ?? 1;
        const [ox, oy, oz] = options.offset ?? [0, 0, 0];
        const groups = options.groups === undefined ? undefined : new Set(options.groups);
        let points: number[] = [];
        let coords: number[] = [];
        let faces: ObjCorner[][] = [];
        let active = groups === undefined;
        for (const line of text.split('\n')) {
            const part = line.trim().split(/\s+/);
            const kind = part[0];
            if (kind === 'v') {
                points.push(
                    Number(part[1]) * scale + ox,
                    Number(part[2]) * scale + oy,
                    Number(part[3]) * scale + oz,
                );
            } else if (kind === 'vt') {
                coords.push(Number(part[1]), Number(part[2]));
            } else if (kind === 'g') {
                active = groups === undefined || groups.has(part[1] ?? '');
            } else if (kind === 'f' && active) {
                const face = part.slice(1).map((corner): ObjCorner => {
                    const [pi, ti] = corner.split('/');
                    const pn = Number(pi);
                    const tn = ti === undefined || ti === '' ? 0 : Number(ti);
                    return {
                        p: pn < 0 ? points.length / 3 + pn : pn - 1,
                        t: tn < 0 ? coords.length / 2 + tn : tn - 1,
                    };
                });
                if (face.length < 3) continue;
                if (options.keep !== undefined) {
                    let [cx, cy, cz] = [0, 0, 0];
                    for (const { p: at } of face) {
                        cx += points[at * 3]!;
                        cy += points[at * 3 + 1]!;
                        cz += points[at * 3 + 2]!;
                    }
                    if (!options.keep(cx / face.length, cy / face.length, cz / face.length)) {
                        continue;
                    }
                }
                faces.push(face);
            }
        }
        for (let level = 0; level < (options.subdivide ?? 0); level++) {
            ({ points, coords, faces } = MeshGeometry.catmullClark(points, coords, faces));
        }
        const corners = new Map<string, number>();
        const positions: number[] = [];
        const uvs: number[] = [];
        const owner: number[] = [];
        const indices: number[] = [];
        for (const face of faces) {
            const at = face.map(({ p: pi, t: ti }) => {
                const key = `${pi}/${ti}`;
                let index = corners.get(key);
                if (index === undefined) {
                    index = owner.length;
                    corners.set(key, index);
                    owner.push(pi);
                    positions.push(points[pi * 3]!, points[pi * 3 + 1]!, points[pi * 3 + 2]!);
                    uvs.push(coords[ti * 2] ?? 0, coords[ti * 2 + 1] ?? 0);
                }
                return index;
            });
            for (let k = 1; k + 1 < at.length; k++) indices.push(at[0]!, at[k]!, at[k + 1]!);
        }
        if (indices.length === 0) throw new RangeError('MeshGeometry.fromObj: nenhuma face lida.');
        // As normais por posição do arquivo: os vértices repetidos na costura do uv recebem a mesma.
        const shared = MeshGeometry.smoothNormals(
            points,
            indices.map((i) => owner[i]!),
        );
        const normals = new Float32Array(owner.length * 3);
        owner.forEach((p, i) => normals.set(shared.subarray(p * 3, p * 3 + 3), i * 3));
        return new MeshGeometry({ positions, indices, normals, uvs });
    }

    /**
     * Um nível de Catmull-Clark (1978) sobre as faces `faces` (cantos de posição e uv): um ponto por face (a média dos
     * cantos), um por aresta (a média das pontas e dos pontos das duas faces; na borda, o meio) e as posições
     * antigas movidas para (F + 2R + (n − 3)P)/n — F a média dos pontos das faces vizinhas, R a dos meios das arestas, n
     * a valência; na borda, ⅛ dos dois vizinhos de borda e ¾ da própria. Cada face vira um quadrilátero por canto. Os
     * uvs são interpolados dentro de cada face (a costura do uv fica onde estava).
     */
    private static catmullClark(
        points: number[],
        coords: number[],
        faces: ObjCorner[][],
    ): { points: number[]; coords: number[]; faces: ObjCorner[][] } {
        const count = points.length / 3;
        const out = points.slice();
        const uv = coords.slice();
        const at = (i: number): [number, number, number] => [
            points[i * 3]!,
            points[i * 3 + 1]!,
            points[i * 3 + 2]!,
        ];
        // Os pontos das faces.
        const facePoint: number[] = [];
        const faceUv: number[] = [];
        for (const face of faces) {
            const c = [0, 0, 0];
            const w = [0, 0];
            for (const { p, t } of face) {
                const q = at(p);
                c[0]! += q[0];
                c[1]! += q[1];
                c[2]! += q[2];
                w[0]! += coords[t * 2] ?? 0;
                w[1]! += coords[t * 2 + 1] ?? 0;
            }
            facePoint.push(out.length / 3);
            out.push(c[0]! / face.length, c[1]! / face.length, c[2]! / face.length);
            faceUv.push(uv.length / 2);
            uv.push(w[0]! / face.length, w[1]! / face.length);
        }
        // As arestas: as pontas, as faces que as usam e o ponto novo.
        interface Edge {
            readonly a: number;
            readonly b: number;
            readonly faces: number[];
            point: number;
        }
        const edges = new Map<number, Edge>();
        const edgeKey = (a: number, b: number): number => Math.min(a, b) * count + Math.max(a, b);
        faces.forEach((face, f) => {
            face.forEach((corner, i) => {
                const next = face[(i + 1) % face.length]!;
                const key = edgeKey(corner.p, next.p);
                const edge = edges.get(key);
                if (edge === undefined)
                    edges.set(key, { a: corner.p, b: next.p, faces: [f], point: -1 });
                else edge.faces.push(f);
            });
        });
        const sumFace = new Float64Array(count * 3);
        const sumEdge = new Float64Array(count * 3);
        const valence = new Uint32Array(count);
        const faceCount = new Uint32Array(count);
        const border = new Float64Array(count * 3);
        const borderCount = new Uint32Array(count);
        for (const edge of edges.values()) {
            const [a, b] = [at(edge.a), at(edge.b)];
            const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
            const inside = edge.faces.length === 2;
            edge.point = out.length / 3;
            if (inside) {
                const [f0, f1] = [facePoint[edge.faces[0]!]! * 3, facePoint[edge.faces[1]!]! * 3];
                out.push(
                    (a[0] + b[0] + out[f0]! + out[f1]!) / 4,
                    (a[1] + b[1] + out[f0 + 1]! + out[f1 + 1]!) / 4,
                    (a[2] + b[2] + out[f0 + 2]! + out[f1 + 2]!) / 4,
                );
            } else out.push(mid[0]!, mid[1]!, mid[2]!);
            for (const [v, other] of [
                [edge.a, b],
                [edge.b, a],
            ] as const) {
                for (let c = 0; c < 3; c++) sumEdge[v * 3 + c]! += mid[c]!;
                valence[v]!++;
                if (!inside) {
                    for (let c = 0; c < 3; c++) border[v * 3 + c]! += other[c]!;
                    borderCount[v]!++;
                }
            }
        }
        faces.forEach((face, f) => {
            const fp = facePoint[f]! * 3;
            for (const { p } of face) {
                for (let c = 0; c < 3; c++) sumFace[p * 3 + c]! += out[fp + c]!;
                faceCount[p]!++;
            }
        });
        for (let v = 0; v < count; v++) {
            const n = valence[v]!;
            if (n === 0) continue;
            const onBorder = borderCount[v] ?? 0;
            const around = faceCount[v] ?? 0;
            for (let c = 0; c < 3; c++) {
                const p = points[v * 3 + c]!;
                if (onBorder === 2) out[v * 3 + c] = 0.75 * p + 0.125 * border[v * 3 + c]!;
                else if (onBorder === 0 && around > 0) {
                    out[v * 3 + c] =
                        (sumFace[v * 3 + c]! / around + (2 * sumEdge[v * 3 + c]!) / n + (n - 3) * p)
                        / n;
                }
            }
        }
        // As faces novas: um quadrilátero por canto; o uv do meio de cada aresta, por par de uvs (a costura fica).
        const edgeUv = new Map<string, number>();
        const midUv = (t0: number, t1: number): number => {
            const key = t0 < t1 ? `${t0}/${t1}` : `${t1}/${t0}`;
            let index = edgeUv.get(key);
            if (index === undefined) {
                index = uv.length / 2;
                edgeUv.set(key, index);
                uv.push(
                    ((coords[t0 * 2] ?? 0) + (coords[t1 * 2] ?? 0)) / 2,
                    ((coords[t0 * 2 + 1] ?? 0) + (coords[t1 * 2 + 1] ?? 0)) / 2,
                );
            }
            return index;
        };
        const next: ObjCorner[][] = [];
        faces.forEach((face, f) => {
            const k = face.length;
            face.forEach((corner, i) => {
                const after = face[(i + 1) % k]!;
                const before = face[(i + k - 1) % k]!;
                next.push([
                    corner,
                    {
                        p: edges.get(edgeKey(corner.p, after.p))!.point,
                        t: midUv(corner.t, after.t),
                    },
                    { p: facePoint[f]!, t: faceUv[f]! },
                    {
                        p: edges.get(edgeKey(before.p, corner.p))!.point,
                        t: midUv(before.t, corner.t),
                    },
                ]);
            });
        });
        return { points: out, coords: uv, faces: next };
    }

    /** Declara os vértices, os índices e as arestas de arame. */
    getDescriptors(): readonly GPUDescriptor[] {
        return [
            {
                id: 'vertices',
                role: 'vertex',
                schema: MeshGeometry.vertexStruct,
                count: this.data.vertexCount,
            },
            { id: 'indices', role: 'index', count: this.data.indexCount },
            ...this.wireDescriptors(),
        ];
    }

    get vertexCount(): number {
        return this.data.vertexCount;
    }
    get indexCount(): number {
        return this.data.indexCount;
    }
}
