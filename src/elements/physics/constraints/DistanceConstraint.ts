import type { GPUDescriptor } from '../../../scene/descriptors/GPUDescriptor';
import { FieldType } from '../../../scene/descriptors/FieldType';
import { StructSchema } from '../../../scene/descriptors/StructSchema';
import { Constraint } from './Constraint';

/**
 * DistanceConstraint segue o struct WGSL `DistanceConstraint` (16 bytes):
 *   i: u32           — índice do body A no pool de partículas
 *   j: u32           — índice do body B no pool de partículas
 *   rest_length: f32 — comprimento de repouso (m)
 *   compliance: f32  — m/N (0 = totalmente rígido)
 */
export class DistanceConstraint extends Constraint {
    static readonly schema = new StructSchema('DistanceConstraint', {
        i: FieldType.u32,
        j: FieldType.u32,
        rest_length: FieldType.f32,
        compliance: FieldType.f32,
    });

    constructor(values: Record<string, unknown> = {}) {
        super();
        this.data = DistanceConstraint.schema.applyDefaults({
            i: values['i'] ?? values['bodyA'] ?? 0,
            j: values['j'] ?? values['bodyB'] ?? 0,
            rest_length: values['rest_length'] ?? values['restLength'] ?? 1,
            compliance: values['compliance'] ?? 0,
        });
    }

    getDescriptors(): readonly GPUDescriptor[] {
        return [{ id: 'constraint', role: 'storage-rw', schema: DistanceConstraint.schema, storage: 'pool' }];
    }
}
