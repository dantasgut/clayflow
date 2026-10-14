import type { GPUDescriptor } from '../../scene/descriptors/GPUDescriptor';
import { FieldType } from '../../scene/descriptors/FieldType';
import { StructSchema } from '../../scene/descriptors/StructSchema';
import { Geometry, type GeometryData } from './Geometry';
import { sharedContent } from './geometryContent';

/** Dado de uma `BoxGeometry`. */
export interface BoxGeometryData extends GeometryData {
    /** Número de vértices. */
    vertexCount: number;
    /** Número de índices. */
    indexCount: number;
    /** Tamanho. */
    size: readonly number[];
}

/**
 * BoxGeometry — paralelepípedo retangular gerado proceduralmente a partir
 * de `size: [w, h, d]`. 24 vértices (4 por face × 6 faces, normais
 * únicas por face) e 36 índices (2 triangles por face).
 *
 * Default size: [1, 1, 1] (cubo unitário centrado na origem).
 */
export class BoxGeometry extends Geometry<BoxGeometryData> {
    /** Vertex layout: position (vec3) + normal (vec3) + uv (vec2). */
    static readonly vertexStruct = new StructSchema('BoxVertex', {
        position: FieldType.vec3f,
        normal: FieldType.vec3f,
        uv: FieldType.vec2f,
    });
    /** Alias para vertexStruct. */
    static readonly schema = BoxGeometry.vertexStruct;

    constructor(values: Record<string, unknown> = {}) {
        super();
        const size = (values.size ?? [1, 1, 1]) as readonly number[];
        const sx = (size[0] ?? 1) / 2,
            sy = (size[1] ?? 1) / 2,
            sz = (size[2] ?? 1) / 2;
        // Mesmo tamanho → mesmos arrays (gerados uma vez por chave; a C2 deduplica os buffers pela chave).
        const { vertices, indices, wireEdges } = sharedContent(
            `BoxGeometry:${sx},${sy},${sz}`,
            () => ({
                vertices: generateBox(sx, sy, sz),
                indices: boxIndices(),
            }),
        );
        this.data = {
            size,
            vertices,
            indices,
            vertexCount: vertices.length / 8,
            indexCount: indices.length,
            wireEdges,
        };
    }

    /** Declara VBO + IBO para alocação automática pelo ResourceSystem. */
    getDescriptors(): readonly GPUDescriptor[] {
        return [
            {
                id: 'vertices',
                role: 'vertex',
                schema: BoxGeometry.vertexStruct,
                count: this.data.vertexCount,
            },
            { id: 'indices', role: 'index', count: this.data.indexCount },
            ...this.wireDescriptors(),
        ];
    }

    /** Vertex count (= 24 para box). */
    get vertexCount(): number {
        return this.data.vertexCount;
    }
    /** Index count (= 36 para box: 2 triangles × 6 faces × 3 indices). */
    get indexCount(): number {
        return this.data.indexCount;
    }
}

function generateBox(sx: number, sy: number, sz: number): Float32Array {
    const v = (
        px: number,
        py: number,
        pz: number,
        nx: number,
        ny: number,
        nz: number,
        u: number,
        vv: number,
    ) => [px, py, pz, nx, ny, nz, u, vv];
    const data: number[] = [
        ...v(-sx, -sy, sz, 0, 0, 1, 0, 0),
        ...v(sx, -sy, sz, 0, 0, 1, 1, 0),
        ...v(sx, sy, sz, 0, 0, 1, 1, 1),
        ...v(-sx, sy, sz, 0, 0, 1, 0, 1),
        ...v(sx, -sy, -sz, 0, 0, -1, 0, 0),
        ...v(-sx, -sy, -sz, 0, 0, -1, 1, 0),
        ...v(-sx, sy, -sz, 0, 0, -1, 1, 1),
        ...v(sx, sy, -sz, 0, 0, -1, 0, 1),
        ...v(-sx, sy, sz, 0, 1, 0, 0, 0),
        ...v(sx, sy, sz, 0, 1, 0, 1, 0),
        ...v(sx, sy, -sz, 0, 1, 0, 1, 1),
        ...v(-sx, sy, -sz, 0, 1, 0, 0, 1),
        ...v(-sx, -sy, -sz, 0, -1, 0, 0, 0),
        ...v(sx, -sy, -sz, 0, -1, 0, 1, 0),
        ...v(sx, -sy, sz, 0, -1, 0, 1, 1),
        ...v(-sx, -sy, sz, 0, -1, 0, 0, 1),
        ...v(sx, -sy, sz, 1, 0, 0, 0, 0),
        ...v(sx, -sy, -sz, 1, 0, 0, 1, 0),
        ...v(sx, sy, -sz, 1, 0, 0, 1, 1),
        ...v(sx, sy, sz, 1, 0, 0, 0, 1),
        ...v(-sx, -sy, -sz, -1, 0, 0, 0, 0),
        ...v(-sx, -sy, sz, -1, 0, 0, 1, 0),
        ...v(-sx, sy, sz, -1, 0, 0, 1, 1),
        ...v(-sx, sy, -sz, -1, 0, 0, 0, 1),
    ];
    return new Float32Array(data);
}

function boxIndices(): Uint16Array {
    const idx: number[] = [];
    for (let f = 0; f < 6; f++) {
        const o = f * 4;
        idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
    }
    return new Uint16Array(idx);
}
