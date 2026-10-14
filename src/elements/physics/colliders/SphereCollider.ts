import type { GPUDescriptor } from '../../../scene/descriptors/GPUDescriptor';
import { FieldType } from '../../../scene/descriptors/FieldType';
import { StructSchema } from '../../../scene/descriptors/StructSchema';
import { Collider } from './Collider';

/** Dado de um `SphereCollider` (layout de `SphereCollider.schema`). */
export interface SphereColliderData {
    /** Centro (local ao corpo dono, ou de mundo sem dono). */
    center: number[];
    /** Raio. */
    radius: number;
    /** Preenchimento do layout. */
    _pad0: number;
    /** Preenchimento do layout. */
    _pad1: number;
    /** Preenchimento do layout. */
    _pad2: number;
}

/** Collider esférico — center + radius. */
export class SphereCollider extends Collider<SphereColliderData> {
    /** StructSchema do SphereCollider (center + radius). */
    static readonly schema = new StructSchema('SphereCollider', {
        center: FieldType.vec4f,
        radius: FieldType.f32,
        _pad0: FieldType.f32,
        _pad1: FieldType.f32,
        _pad2: FieldType.f32,
    });

    constructor(values: Partial<SphereColliderData> = {}) {
        super();
        this.data = {
            center: values.center ?? [0, 0, 0, 1],
            radius: values.radius ?? 0.5,
            _pad0: 0,
            _pad1: 0,
            _pad2: 0,
        };
    }

    getDescriptors(): readonly GPUDescriptor[] {
        return [
            { id: 'collider', role: 'storage-ro', schema: SphereCollider.schema, storage: 'pool' },
        ];
    }
}
