import type { GPUDescriptor } from '../../../scene/descriptors/GPUDescriptor';
import { FieldType } from '../../../scene/descriptors/FieldType';
import { StructSchema } from '../../../scene/descriptors/StructSchema';
import { ForceField } from './ForceField';

export class VortexField extends ForceField {
    static readonly schema = new StructSchema('VortexField', {
        axis: FieldType.vec4f,
        center: FieldType.vec4f,
        magnitude: FieldType.f32,
        falloff: FieldType.f32,
        _pad0: FieldType.f32,
        _pad1: FieldType.f32,
    });

    constructor(values: Record<string, unknown> = {}) {
        super();
        this.data = VortexField.schema.applyDefaults({
            axis: values['axis'] ?? [0, 1, 0, 0],
            center: values['center'] ?? [0, 0, 0, 1],
            magnitude: values['magnitude'] ?? 1.0,
            falloff: values['falloff'] ?? 1.0,
        });
    }

    getDescriptors(): readonly GPUDescriptor[] {
        return [{ id: 'vortex', role: 'uniform', schema: VortexField.schema }];
    }
}
