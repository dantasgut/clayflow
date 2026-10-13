import type { GPUDescriptor } from '../../../scene/descriptors/GPUDescriptor';
import { FieldType } from '../../../scene/descriptors/FieldType';
import { StructSchema } from '../../../scene/descriptors/StructSchema';
import { Collider } from './Collider';

/** Dado de um `PlaneCollider` (layout de `PlaneCollider.schema`). */
export interface PlaneColliderData {
    normal: number[];
    offset: number;
    _pad0: number;
    _pad1: number;
    _pad2: number;
}

/** Collider de plano infinito — normal + offset (distance from origin). */
export class PlaneCollider extends Collider<PlaneColliderData> {
    /** StructSchema do PlaneCollider (normal + offset). */
    static readonly schema = new StructSchema('PlaneCollider', {
        normal: FieldType.vec4f,
        offset: FieldType.f32,
        _pad0: FieldType.f32,
        _pad1: FieldType.f32,
        _pad2: FieldType.f32,
    });

    constructor(values: Partial<PlaneColliderData> = {}) {
        super();
        this.data = {
            normal: values.normal ?? [0, 1, 0, 0],
            offset: values.offset ?? 0,
            _pad0: 0,
            _pad1: 0,
            _pad2: 0,
        };
    }

    getDescriptors(): readonly GPUDescriptor[] {
        return [
            { id: 'collider', role: 'storage-ro', schema: PlaneCollider.schema, storage: 'pool' },
        ];
    }
}
