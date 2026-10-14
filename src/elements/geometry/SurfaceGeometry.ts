import type { GPUDescriptor } from '../../scene/descriptors/GPUDescriptor';
import { FieldType } from '../../scene/descriptors/FieldType';
import { StructSchema } from '../../scene/descriptors/StructSchema';
import { Geometry, type GeometryData } from './Geometry';

/** Dado de uma `SurfaceGeometry`. */
export interface SurfaceGeometryData extends GeometryData {
    /** Vértices intercalados (posição, normal, uv; 8 floats): o estado inicial; depois a GPU escreve posição e normal. */
    vertices: Float32Array;
    /** Triângulos (índices locais de vértice). */
    indices: Uint32Array;
    /**
     * Adjacência vértice → triângulos (CSR): `vertexCount + 1` inícios seguidos dos triângulos de cada vértice — o que o
     * kernel de normais soma por vértice.
     */
    adjacency: Uint32Array;
    vertexCount: number;
    indexCount: number;
}

/**
 * Superfície de malha escrita pela GPU (spec 008, R5): os vértices de um corpo mole, um por partícula, recalculados a
 * cada quadro por um estágio (posição da faixa do corpo no pool, normal média dos triângulos adjacentes) e desenhados
 * pelo forward e pela sombra como qualquer geometria. A CPU envia só o estado inicial (`upload: 'initial'`: uvs e
 * posições do momento da inserção) e os triângulos; quem escreve os vértices declara a posse (`owns`).
 *
 * Fica fora da deduplicação por conteúdo: cada superfície é própria do seu corpo.
 */
export class SurfaceGeometry extends Geometry<SurfaceGeometryData> {
    /** Layout do vértice (o do forward: posição, normal, uv; 32 bytes). */
    static readonly vertexStruct = new StructSchema('SurfaceVertex', {
        position: FieldType.vec3f,
        normal: FieldType.vec3f,
        uv: FieldType.vec2f,
    });
    /** Elemento da adjacência (`u32`). */
    static readonly adjacencySchema = new StructSchema('SurfaceAdjacency', {
        value: FieldType.u32,
    });

    /**
     * @param positions - Posições iniciais (`x, y, z` por vértice).
     * @param triangles - Triângulos (3 índices locais por triângulo, sentido anti-horário visto de fora).
     * @param uvs - Coordenadas de textura (`u, v` por vértice). Default zero.
     * @throws RangeError se um índice está fora dos vértices ou os tamanhos não batem.
     */
    constructor(
        positions: ArrayLike<number>,
        triangles: ArrayLike<number>,
        uvs?: ArrayLike<number>,
    ) {
        super();
        const n = positions.length / 3;
        const t = triangles.length / 3;
        if (!Number.isInteger(t) || t < 1) {
            throw new RangeError(
                `SurfaceGeometry: triangles tem ${triangles.length} índices — são 3 por triângulo, ao menos um.`,
            );
        }
        if (uvs !== undefined && uvs.length !== n * 2) {
            throw new RangeError(
                `SurfaceGeometry: uvs tem ${uvs.length} valores; com ${n} vértices são ${n * 2}.`,
            );
        }
        const indices = new Uint32Array(triangles.length);
        const degree = new Uint32Array(n);
        for (let k = 0; k < triangles.length; k++) {
            const v = triangles[k]!;
            if (!Number.isInteger(v) || v < 0 || v >= n) {
                throw new RangeError(
                    `SurfaceGeometry: triangles[${k}] = ${v} fora dos ${n} vértices.`,
                );
            }
            indices[k] = v;
            degree[v]!++;
        }
        const adjacency = new Uint32Array(n + 1 + triangles.length);
        for (let v = 0; v < n; v++) adjacency[v + 1] = adjacency[v]! + degree[v]!;
        const cursor = adjacency.slice(0, n);
        for (let k = 0; k < triangles.length; k++) {
            const v = indices[k]!;
            adjacency[n + 1 + cursor[v]!++] = Math.floor(k / 3);
        }
        const vertices = new Float32Array(n * 8);
        for (let v = 0; v < n; v++) {
            vertices.set(
                [positions[v * 3]!, positions[v * 3 + 1]!, positions[v * 3 + 2]!, 0, 1, 0],
                v * 8,
            );
            vertices[v * 8 + 6] = uvs?.[v * 2] ?? 0;
            vertices[v * 8 + 7] = uvs?.[v * 2 + 1] ?? 0;
        }
        this.data = { vertices, indices, adjacency, vertexCount: n, indexCount: indices.length };
    }

    /** Número de triângulos. */
    get triangleCount(): number {
        return this.data.indexCount / 3;
    }

    get vertexCount(): number {
        return this.data.vertexCount;
    }

    get indexCount(): number {
        return this.data.indexCount;
    }

    /** Própria do corpo: fora da deduplicação por conteúdo. */
    override get contentKey(): string | undefined {
        return undefined;
    }

    /** Vértices (estado inicial; depois escritos pela GPU), triângulos e adjacência. */
    getDescriptors(): readonly GPUDescriptor[] {
        return [
            {
                id: 'vertices',
                role: 'vertex',
                schema: SurfaceGeometry.vertexStruct,
                count: this.data.vertexCount,
                upload: 'initial',
            },
            { id: 'indices', role: 'index', count: this.data.indexCount },
            {
                id: 'adjacency',
                role: 'storage-ro',
                schema: SurfaceGeometry.adjacencySchema,
                count: this.data.adjacency.length,
            },
        ];
    }
}
