import type { GPUDescriptor } from '../../../scene/descriptors/GPUDescriptor';
import { FieldType } from '../../../scene/descriptors/FieldType';
import { StructSchema } from '../../../scene/descriptors/StructSchema';
import { FieldKind, ForceField, type FieldRecordValues } from './ForceField';

/** Dado de um `WindField` (layout de `WindField.schema`). */
export interface WindFieldData {
    /** Direção. */
    direction: readonly number[];
    /** Intensidade. */
    magnitude: number;
    /** Turbulência. */
    turbulence: number;
    /** Preenchimento do layout. */
    _pad0: number;
    /** Preenchimento do layout. */
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
        this.data = this.withRecord({
            direction: values.direction ?? [1, 0, 0, 0],
            magnitude: values.magnitude ?? 1.0,
            turbulence: values.turbulence ?? 0.0,
            _pad0: 0,
            _pad1: 0,
        });
    }

    getDescriptors(): readonly GPUDescriptor[] {
        return [ForceField.recordDescriptor];
    }

    /** Vento (spec 009): aceleração na direção (normalizada) vezes a intensidade, com rajadas pela turbulência. */
    protected fieldRecord(d: Readonly<WindFieldData>): FieldRecordValues {
        const [x = 0, y = 0, z = 0] = d.direction;
        const len = Math.hypot(x, y, z) || 1;
        const m = d.magnitude / len;
        return {
            kind: FieldKind.wind,
            a: [x * m, y * m, z * m, 0],
            b: [],
            s: [d.turbulence, 0.25, 0, 0],
        };
    }
}
