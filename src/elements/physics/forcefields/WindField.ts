import type { GPUDescriptor } from '../../../scene/descriptors/GPUDescriptor';
import { FieldType } from '../../../scene/descriptors/FieldType';
import { StructSchema } from '../../../scene/descriptors/StructSchema';
import { ForceField } from './ForceField';

/** Dado de um `WindField` (layout de `WindField.schema`). */
export interface WindFieldData {
    direction: readonly number[];
    magnitude: number;
    turbulence: number;
    _pad0: number;
    _pad1: number;
}

/**
 * Campo de vento — força direcional + turbulence noise sobre todos os
 * physics bodies. Útil para folhas, panos, partículas atmosféricas.
 */
export class WindField extends ForceField<WindFieldData> {
    /** StructSchema do WindField (direction+magnitude+turbulence). */
    static readonly schema = new StructSchema('WindField', {
        direction: FieldType.vec4f,
        magnitude: FieldType.f32,
        turbulence: FieldType.f32,
        _pad0: FieldType.f32,
        _pad1: FieldType.f32,
    });

    constructor(values: Partial<WindFieldData> = {}) {
        super();
        this.data = {
            direction: values.direction ?? [1, 0, 0, 0],
            magnitude: values.magnitude ?? 1.0,
            turbulence: values.turbulence ?? 0.0,
            _pad0: 0,
            _pad1: 0,
        };
    }

    getDescriptors(): readonly GPUDescriptor[] {
        return [{ id: 'wind', role: 'uniform', schema: WindField.schema }];
    }
}
