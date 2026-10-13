import type { GPUDescriptor } from '../../scene/descriptors/GPUDescriptor';
import type { PipelineDescriptor } from '../../scene/descriptors/PipelineDescriptor';
import { FieldType } from '../../scene/descriptors/FieldType';
import { StructSchema } from '../../scene/descriptors/StructSchema';
import { Geometry, type GeometryData } from './Geometry';

/** Dado de uma `PointCloudGeometry`. */
export interface PointCloudGeometryData extends GeometryData {
    vertexCount: number;
    indexCount: number;
    maxParticles: number;
}

/**
 * Point cloud — array de pontos como geometry. Cada ponto tem position +
 * normal (para shading point-sprite). Usado por particle systems e
 * scientific visualization.
 */
export class PointCloudGeometry extends Geometry<PointCloudGeometryData> {
    /** StructSchema do ponto (position + normal, 32 bytes). */
    static readonly schema = new StructSchema('PointCloudPoint', {
        position: FieldType.vec4f,
        normal: FieldType.vec4f,
    });

    constructor(values: Record<string, unknown> = {}) {
        super();
        const max = (values.maxParticles ?? 1024) as number;
        this.data = { maxParticles: max, vertexCount: max, indexCount: 0 };
    }

    override getDescriptors(): readonly GPUDescriptor[] {
        return [
            {
                id: 'points',
                role: 'storage-rw',
                schema: PointCloudGeometry.schema,
                count: this.data.maxParticles,
            },
        ];
    }

    override getPipelineDescriptors(): readonly PipelineDescriptor[] {
        return [];
    }

    /** Número de pontos no buffer (sempre = `maxParticles`). */
    get vertexCount(): number {
        return this.data.vertexCount;
    }
    /** Point clouds não usam index buffer — sempre 0. */
    get indexCount(): number {
        return 0;
    }
}
