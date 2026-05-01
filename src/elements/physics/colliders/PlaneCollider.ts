import type { GPUDescriptor } from '../../../scene/descriptors/GPUDescriptor';
import { FieldType } from '../../../scene/descriptors/FieldType';
import { StructSchema } from '../../../scene/descriptors/StructSchema';
import { Collider } from './Collider';

export class PlaneCollider extends Collider {
    static readonly schema = new StructSchema('PlaneCollider', {
        normal: FieldType.vec4f,
        offset: FieldType.f32,
        _pad0: FieldType.f32,
        _pad1: FieldType.f32,
        _pad2: FieldType.f32,
    });

    constructor(values: Record<string, unknown> = {}) {
        super();
        this.data = PlaneCollider.schema.applyDefaults({
            normal: values.normal ?? [0, 1, 0, 0],
            offset: values.offset ?? 0,
        });
    }

    getDescriptors(): readonly GPUDescriptor[] {
        return [
            { id: 'collider', role: 'storage-ro', schema: PlaneCollider.schema, storage: 'pool' },
        ];
    }
}
