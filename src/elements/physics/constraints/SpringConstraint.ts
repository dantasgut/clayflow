import type { GPUDescriptor } from '../../../scene/descriptors/GPUDescriptor';
import { FieldType } from '../../../scene/descriptors/FieldType';
import { StructSchema } from '../../../scene/descriptors/StructSchema';
import { Constraint } from './Constraint';

/**
 * Constraint mola entre 2 bodies — F = -k·(|d| - rest)·d̂ - c·v_rel.
 * `color` é populado por graph coloring para safe parallel solve.
 */
export class SpringConstraint extends Constraint {
    /** StructSchema do SpringConstraint (bodyA/B, k, c, restLength, color). */
    static readonly schema = new StructSchema('SpringConstraint', {
        bodyA: FieldType.u32,
        bodyB: FieldType.u32,
        stiffness: FieldType.f32,
        damping: FieldType.f32,
        restLength: FieldType.f32,
        color: FieldType.u32,
        _pad0: FieldType.u32,
        _pad1: FieldType.u32,
    });

    constructor(values: Record<string, unknown> = {}) {
        super();
        this.data = SpringConstraint.schema.applyDefaults({
            bodyA: values.bodyA ?? 0,
            bodyB: values.bodyB ?? 0,
            stiffness: values.stiffness ?? 100.0,
            damping: values.damping ?? 1.0,
            restLength: values.restLength ?? 1.0,
            color: 0,
        });
    }

    getDescriptors(): readonly GPUDescriptor[] {
        return [
            {
                id: 'constraint',
                role: 'storage-rw',
                schema: SpringConstraint.schema,
                storage: 'pool',
            },
        ];
    }
}
