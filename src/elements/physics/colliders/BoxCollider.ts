import type { GPUDescriptor } from '../../../scene/descriptors/GPUDescriptor';
import { FieldType } from '../../../scene/descriptors/FieldType';
import { StructSchema } from '../../../scene/descriptors/StructSchema';
import { Collider } from './Collider';

/** Dado de um `BoxCollider` (layout de `BoxCollider.schema`). */
export interface BoxColliderData {
    /** Meia-extensão por eixo. */
    halfExtents: number[];
    /** Centro (local ao corpo dono, ou de mundo sem dono). */
    center: number[];
}

/** Collider AABB — half-extents em XYZ + center offset. */
export class BoxCollider extends Collider<BoxColliderData> {
    /** StructSchema do BoxCollider (halfExtents + center, 32 bytes). */
    static readonly schema = new StructSchema('BoxCollider', {
        halfExtents: FieldType.vec4f,
        center: FieldType.vec4f,
    });

    constructor(values: Partial<BoxColliderData> = {}) {
        super();
        this.data = {
            halfExtents: values.halfExtents ?? [0.5, 0.5, 0.5, 0],
            center: values.center ?? [0, 0, 0, 1],
        };
    }

    getDescriptors(): readonly GPUDescriptor[] {
        return [
            { id: 'collider', role: 'storage-ro', schema: BoxCollider.schema, storage: 'pool' },
        ];
    }
}
