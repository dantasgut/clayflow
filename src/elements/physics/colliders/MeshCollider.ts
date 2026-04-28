import type { GPUDescriptor } from '../../../scene/descriptors/GPUDescriptor';
import { FieldType } from '../../../scene/descriptors/FieldType';
import { StructSchema } from '../../../scene/descriptors/StructSchema';
import { Collider } from './Collider';

export class MeshCollider extends Collider {
    static readonly schema = new StructSchema('MeshCollider', {
        triangleCount: FieldType.u32,
        firstTriangle: FieldType.u32,
        _pad0: FieldType.u32,
        _pad1: FieldType.u32,
    });

    constructor(values: Record<string, unknown> = {}) {
        super();
        const triangles = (values['triangles'] ?? []) as readonly number[];
        this.data = MeshCollider.schema.applyDefaults({
            triangleCount: triangles.length / 9,
            firstTriangle: 0,
        });
        this.data['triangles'] = triangles;
    }

    getDescriptors(): readonly GPUDescriptor[] {
        return [{ id: 'collider', role: 'storage-ro', schema: MeshCollider.schema, storage: 'pool' }];
    }
}
