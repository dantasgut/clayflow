import type { GPUDescriptor } from '../../../scene/descriptors/GPUDescriptor';
import { FieldType } from '../../../scene/descriptors/FieldType';
import { StructSchema } from '../../../scene/descriptors/StructSchema';
import { ForceField } from './ForceField';

/** Dado de um `VortexField` (layout de `VortexField.schema`). */
export interface VortexFieldData {
    /** Eixo de rotação. */
    axis: readonly number[];
    /** Centro (local ao corpo dono, ou de mundo sem dono). */
    center: readonly number[];
    /** Intensidade. */
    magnitude: number;
    /** Decaimento com a distância. */
    falloff: number;
    /** Preenchimento do layout. */
    _pad0: number;
    /** Preenchimento do layout. */
    _pad1: number;
}

/**
 * Campo de vórtice — torque rotacional ao redor de um eixo (axis) com
 * falloff radial a partir do center. Cria efeitos de tornado, redemoinho.
 */
export class VortexField extends ForceField<VortexFieldData> {
    /** StructSchema do VortexField (axis+center+magnitude+falloff). */
    static readonly schema = new StructSchema('VortexField', {
        axis: FieldType.vec4f,
        center: FieldType.vec4f,
        magnitude: FieldType.f32,
        falloff: FieldType.f32,
        _pad0: FieldType.f32,
        _pad1: FieldType.f32,
    });

    constructor(values: Partial<VortexFieldData> = {}) {
        super();
        this.data = {
            axis: values.axis ?? [0, 1, 0, 0],
            center: values.center ?? [0, 0, 0, 1],
            magnitude: values.magnitude ?? 1.0,
            falloff: values.falloff ?? 1.0,
            _pad0: 0,
            _pad1: 0,
        };
    }

    getDescriptors(): readonly GPUDescriptor[] {
        return [{ id: 'vortex', role: 'uniform', schema: VortexField.schema }];
    }
}
