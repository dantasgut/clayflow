import type { GPUDescriptor } from '../../../scene/descriptors/GPUDescriptor';
import { FieldType } from '../../../scene/descriptors/FieldType';
import { StructSchema } from '../../../scene/descriptors/StructSchema';
import { Constraint } from './Constraint';

export class DistanceConstraint extends Constraint {
    static readonly schema = new StructSchema('DistanceConstraint', {
        bodyA: FieldType.u32,
        bodyB: FieldType.u32,
        minDist: FieldType.f32,
        maxDist: FieldType.f32,
        compliance: FieldType.f32,
        color: FieldType.u32,
        _pad0: FieldType.u32,
        _pad1: FieldType.u32,
    });

    constructor(values: Record<string, unknown> = {}) {
        super();
        this.data = DistanceConstraint.schema.applyDefaults({
            bodyA: values['bodyA'] ?? 0,
            bodyB: values['bodyB'] ?? 0,
            minDist: values['minDist'] ?? 0,
            maxDist: values['maxDist'] ?? 1,
            compliance: values['compliance'] ?? 0,
            color: 0,
        });
    }

    getDescriptors(): readonly GPUDescriptor[] {
        return [{ id: 'constraint', role: 'storage-rw', schema: DistanceConstraint.schema, storage: 'pool' }];
    }
}
