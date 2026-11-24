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
        const points: number[] = [];
        const coords: number[] = [];
        const corners = new Map<string, number>();
        const positions: number[] = [];
        const uvs: number[] = [];
        const owner: number[] = [];
        const indices: number[] = [];
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
                const face = part.slice(1).map((corner) => {
                    const [p, t] = corner.split('/');
                    const pi = Number(p);
                    const ti = t === undefined || t === '' ? 0 : Number(t);
                    return {
                        p: pi < 0 ? points.length / 3 + pi : pi - 1,
                        t: ti < 0 ? coords.length / 2 + ti : ti - 1,
                    };
                });
                if (face.length < 3) continue;
                if (options.keep !== undefined) {
                    let [cx, cy, cz] = [0, 0, 0];
                    for (const { p } of face) {
                        cx += points[p * 3]!;
                        cy += points[p * 3 + 1]!;
                        cz += points[p * 3 + 2]!;
                    }
                    if (!options.keep(cx / face.length, cy / face.length, cz / face.length)) {
                        continue;
                    }
                }
                const at = face.map(({ p, t }) => {
                    const key = `${p}/${t}`;
                    let index = corners.get(key);
                    if (index === undefined) {
                        index = owner.length;
                        corners.set(key, index);
                        owner.push(p);
                        positions.push(points[p * 3]!, points[p * 3 + 1]!, points[p * 3 + 2]!);
                        uvs.push(coords[t * 2] ?? 0, coords[t * 2 + 1] ?? 0);
                    }
                    return index;
                });
                for (let k = 1; k + 1 < at.length; k++) indices.push(at[0]!, at[k]!, at[k + 1]!);
            }
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
