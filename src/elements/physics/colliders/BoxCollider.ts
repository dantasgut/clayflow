import type { GPUDescriptor } from '../../../scene/descriptors/GPUDescriptor';
import { FieldType } from '../../../scene/descriptors/FieldType';
import { StructSchema } from '../../../scene/descriptors/StructSchema';
import { Collider } from './Collider';

/** Collider AABB — half-extents em XYZ + center offset. */
export class BoxCollider extends Collider {
    /** StructSchema do BoxCollider (halfExtents + center, 32 bytes). */
    static readonly schema = new StructSchema('BoxCollider', {
        halfExtents: FieldType.vec4f,
        center: FieldType.vec4f,
    });

    constructor(values: Record<string, unknown> = {}) {
        super();
        this.data = BoxCollider.schema.applyDefaults({
            halfExtents: values.halfExtents ?? [0.5, 0.5, 0.5, 0],
            center: values.center ?? [0, 0, 0, 1],
        });
    }

    getDescriptors(): readonly GPUDescriptor[] {
        return [
            { id: 'collider', role: 'storage-ro', schema: BoxCollider.schema, storage: 'pool' },
        ];
    }
}
