import type { GPUDescriptor } from '../../../scene/descriptors/GPUDescriptor';
import { FieldType } from '../../../scene/descriptors/FieldType';
import { StructSchema } from '../../../scene/descriptors/StructSchema';
import { Collider } from './Collider';

export class SphereCollider extends Collider {
    static readonly schema = new StructSchema('SphereCollider', {
        center: FieldType.vec4f,
        radius: FieldType.f32,
        _pad0: FieldType.f32,
        _pad1: FieldType.f32,
        _pad2: FieldType.f32,
    });

    constructor(values: Record<string, unknown> = {}) {
        super();
        this.data = SphereCollider.schema.applyDefaults({
            center: values.center ?? [0, 0, 0, 1],
            radius: values.radius ?? 0.5,
        });
    }

    getDescriptors(): readonly GPUDescriptor[] {
        return [
            { id: 'collider', role: 'storage-ro', schema: SphereCollider.schema, storage: 'pool' },
        ];
    }
}
