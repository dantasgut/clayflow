import type { GPUDescriptor } from '../../../scene/descriptors/GPUDescriptor';
import { FieldType } from '../../../scene/descriptors/FieldType';
import { StructSchema } from '../../../scene/descriptors/StructSchema';
import { ForceField } from './ForceField';

/**
 * Campo de vento — força direcional + turbulence noise sobre todos os
 * physics bodies. Útil para folhas, panos, partículas atmosféricas.
 */
export class WindField extends ForceField {
    /** StructSchema do WindField (direction+magnitude+turbulence). */
    static readonly schema = new StructSchema('WindField', {
        direction: FieldType.vec4f,
        magnitude: FieldType.f32,
        turbulence: FieldType.f32,
        _pad0: FieldType.f32,
        _pad1: FieldType.f32,
    });

    constructor(values: Record<string, unknown> = {}) {
        super();
        this.data = WindField.schema.applyDefaults({
            direction: values.direction ?? [1, 0, 0, 0],
            magnitude: values.magnitude ?? 1.0,
            turbulence: values.turbulence ?? 0.0,
        });
    }

    getDescriptors(): readonly GPUDescriptor[] {
        return [{ id: 'wind', role: 'uniform', schema: WindField.schema }];
    }
}
