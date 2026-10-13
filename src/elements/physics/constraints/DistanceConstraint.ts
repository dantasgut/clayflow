import type { GPUDescriptor } from '../../../scene/descriptors/GPUDescriptor';
import { FieldType } from '../../../scene/descriptors/FieldType';
import { StructSchema } from '../../../scene/descriptors/StructSchema';
import { Constraint } from './Constraint';

/** Dado de um `DistanceConstraint` (layout de `DistanceConstraint.schema`). */
export interface DistanceConstraintData {
    i: number;
    j: number;
    rest_length: number;
    compliance: number;
}

/** Valores do construtor do `DistanceConstraint`: os campos do dado, com `bodyA`/`bodyB`/`restLength` como sinônimos. */
export interface DistanceConstraintValues extends Partial<DistanceConstraintData> {
    bodyA?: number;
    bodyB?: number;
    restLength?: number;
}

/**
 * DistanceConstraint segue o struct WGSL `DistanceConstraint` (16 bytes):
 *   i: u32           — índice do body A no pool de partículas
 *   j: u32           — índice do body B no pool de partículas
 *   rest_length: f32 — comprimento de repouso (m)
 *   compliance: f32  — m/N (0 = totalmente rígido)
 */
export class DistanceConstraint extends Constraint<DistanceConstraintData> {
    /** StructSchema do DistanceConstraint (16 bytes: i/j/rest_length/compliance). */
    static readonly schema = new StructSchema('DistanceConstraint', {
        i: FieldType.u32,
        j: FieldType.u32,
        rest_length: FieldType.f32,
        compliance: FieldType.f32,
    });

    constructor(values: DistanceConstraintValues = {}) {
        super();
        this.data = {
            i: values.i ?? values.bodyA ?? 0,
            j: values.j ?? values.bodyB ?? 0,
            rest_length: values.rest_length ?? values.restLength ?? 1,
            compliance: values.compliance ?? 0,
        };
    }

    getDescriptors(): readonly GPUDescriptor[] {
        return [
            {
                id: 'constraint',
                role: 'storage-rw',
                schema: DistanceConstraint.schema,
                storage: 'pool',
            },
        ];
    }
}
