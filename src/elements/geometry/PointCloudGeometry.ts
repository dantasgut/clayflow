import type { GPUDescriptor } from '../../scene/descriptors/GPUDescriptor';
import type { PipelineDescriptor } from '../../scene/descriptors/PipelineDescriptor';
import { FieldType } from '../../scene/descriptors/FieldType';
import { StructSchema } from '../../scene/descriptors/StructSchema';
import { Geometry } from './Geometry';

export class PointCloudGeometry extends Geometry {
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
                count: this.data.maxParticles as number,
            },
        ];
    }

    override getPipelineDescriptors(): readonly PipelineDescriptor[] {
        return [];
    }

    get vertexCount(): number {
        return this.data.vertexCount as number;
    }
    get indexCount(): number {
        return 0;
    }
}
