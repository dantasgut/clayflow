import type { GPUDescriptor } from '../../../scene/descriptors/GPUDescriptor';
import { FieldType } from '../../../scene/descriptors/FieldType';
import { StructSchema } from '../../../scene/descriptors/StructSchema';
import { ForceField } from './ForceField';

export class GravityField extends ForceField {
    static readonly schema = new StructSchema('GravityField', {
        sourceMode: FieldType.u32,
        _pad0: FieldType.u32,
        _pad1: FieldType.u32,
        _pad2: FieldType.u32,
        acceleration: FieldType.vec4f,
        sourcePosition: FieldType.vec4f,
        sourceMass: FieldType.f32,
        gravitationalConstant: FieldType.f32,
        _pad3: FieldType.f32,
        _pad4: FieldType.f32,
    });

    constructor(values: Record<string, unknown> = {}) {
        super();
        this.data = GravityField.schema.applyDefaults({
            sourceMode: (values['sourceMode'] ?? 0) as number,
            acceleration: values['acceleration'] ?? [0, -9.81, 0, 0],
            sourcePosition: values['sourcePosition'] ?? [0, 0, 0, 1],
            sourceMass: values['sourceMass'] ?? 0,
            gravitationalConstant: values['gravitationalConstant'] ?? 6.674e-11,
        });
    }

    getDescriptors(): readonly GPUDescriptor[] {
        return [{ id: 'gravity', role: 'uniform', schema: GravityField.schema }];
    }
}
