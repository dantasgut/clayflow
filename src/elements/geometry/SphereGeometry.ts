import type { GPUDescriptor } from '../../scene/descriptors/GPUDescriptor';
import { FieldType } from '../../scene/descriptors/FieldType';
import { StructSchema } from '../../scene/descriptors/StructSchema';
import { Geometry } from './Geometry';

/**
 * SphereGeometry — esfera gerada via lat/lon tessellation. Default 16
 * latitude segments × 32 longitude segments = 512 quads = 1024 triangles.
 * Aumente `latSegments`/`lonSegments` para superfícies mais smooth.
 */
export class SphereGeometry extends Geometry {
    /** Vertex layout idêntico a BoxGeometry: position + normal + uv. */
    static readonly vertexStruct = new StructSchema('SphereVertex', {
        position: FieldType.vec3f,
        normal: FieldType.vec3f,
        uv: FieldType.vec2f,
    });
    /** Alias para vertexStruct. */
    static readonly schema = SphereGeometry.vertexStruct;

    constructor(values: Record<string, unknown> = {}) {
        super();
        const radius = (values.radius ?? 1) as number;
        const lat = (values.latSegments ?? 16) as number;
        const lon = (values.lonSegments ?? 32) as number;
        const { vertices, indices } = generateSphere(radius, lat, lon);
        this.data = {
            radius,
            latSegments: lat,
            lonSegments: lon,
            vertices,
            indices,
            vertexCount: vertices.length / 8,
            indexCount: indices.length,
        };
    }

    /** Declara VBO + IBO. */
    getDescriptors(): readonly GPUDescriptor[] {
        return [
            {
                id: 'vertices',
                role: 'vertex',
                schema: SphereGeometry.vertexStruct,
                count: this.data.vertexCount as number,
            },
            { id: 'indices', role: 'index', count: this.data.indexCount as number },
        ];
    }

    /** = (lat+1) × (lon+1). */
    get vertexCount(): number {
        return this.data.vertexCount as number;
    }
    /** = lat × lon × 6 (2 triangles por quad). */
    get indexCount(): number {
        return this.data.indexCount as number;
    }
}

function generateSphere(
    radius: number,
    lat: number,
    lon: number,
): { vertices: Float32Array; indices: Uint16Array } {
    const verts: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i <= lat; i++) {
        const theta = (i / lat) * Math.PI;
        const sinT = Math.sin(theta),
            cosT = Math.cos(theta);
        for (let j = 0; j <= lon; j++) {
            const phi = (j / lon) * 2 * Math.PI;
            const sinP = Math.sin(phi),
                cosP = Math.cos(phi);
            const x = sinT * cosP,
                y = cosT,
                z = sinT * sinP;
            verts.push(x * radius, y * radius, z * radius, x, y, z, j / lon, i / lat);
        }
    }
    const stride = lon + 1;
    for (let i = 0; i < lat; i++) {
        for (let j = 0; j < lon; j++) {
            const a = i * stride + j;
            const b = a + 1;
            const c = a + stride;
            const d = c + 1;
            idx.push(a, c, b, b, c, d);
        }
    }
    return { vertices: new Float32Array(verts), indices: new Uint16Array(idx) };
}
