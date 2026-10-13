import type { GPUDescriptor } from '../../../scene/descriptors/GPUDescriptor';
import { FieldType } from '../../../scene/descriptors/FieldType';
import { StructSchema } from '../../../scene/descriptors/StructSchema';
import { Collider } from './Collider';

/** Dado de um `MeshCollider` (layout de `MeshCollider.schema` mais os triângulos, 9 floats cada). */
export interface MeshColliderData {
    triangleCount: number;
    firstTriangle: number;
    _pad0: number;
    _pad1: number;
    triangles: readonly number[];
}

/**
 * Collider triangle-mesh estático — referencia faixa do triangle pool
 * (firstTriangle + triangleCount). Para shapes deformáveis, use SoftBody.
 */
export class MeshCollider extends Collider<MeshColliderData> {
    /** StructSchema do MeshCollider (triangleCount + firstTriangle). */
    static readonly schema = new StructSchema('MeshCollider', {
        triangleCount: FieldType.u32,
        firstTriangle: FieldType.u32,
        _pad0: FieldType.u32,
        _pad1: FieldType.u32,
    });

    constructor(values: Partial<Pick<MeshColliderData, 'triangles'>> = {}) {
        super();
        const triangles = values.triangles ?? [];
        this.data = {
            triangleCount: triangles.length / 9,
            firstTriangle: 0,
            _pad0: 0,
            _pad1: 0,
            triangles,
        };
    }

    getDescriptors(): readonly GPUDescriptor[] {
        return [
            { id: 'collider', role: 'storage-ro', schema: MeshCollider.schema, storage: 'pool' },
        ];
    }
}
