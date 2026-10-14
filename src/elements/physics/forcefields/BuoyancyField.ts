import type { GPUDescriptor } from '../../../scene/descriptors/GPUDescriptor';
import { FieldType } from '../../../scene/descriptors/FieldType';
import { StructSchema } from '../../../scene/descriptors/StructSchema';
import { ForceField } from './ForceField';

/** Dado de um `BuoyancyField` (layout de `BuoyancyField.schema`). */
export interface BuoyancyFieldData {
    /** Densidade do fluido. */
    fluidDensity: number;
    /** Altura da superfície do fluido. */
    fluidLevel: number;
    /** Gravidade. */
    gravity: number;
    /** Preenchimento do layout. */
    _pad: number;
}

/**
 * Campo de empuxo — Princípio de Arquimedes. Aplica força vertical
 * proporcional ao volume submerso × fluidDensity × gravity. Bodies
 * acima do fluidLevel não recebem empuxo.
 */
export class BuoyancyField extends ForceField<BuoyancyFieldData> {
    /** StructSchema do BuoyancyField (fluidDensity + fluidLevel + gravity). */
    static readonly schema = new StructSchema('BuoyancyField', {
        fluidDensity: FieldType.f32,
        fluidLevel: FieldType.f32,
        gravity: FieldType.f32,
        _pad: FieldType.f32,
    });

    constructor(values: Partial<BuoyancyFieldData> = {}) {
        super();
        this.data = {
            fluidDensity: values.fluidDensity ?? 1000.0,
            fluidLevel: values.fluidLevel ?? 0.0,
            gravity: values.gravity ?? 9.81,
            _pad: 0,
        };
    }

    getDescriptors(): readonly GPUDescriptor[] {
        return [{ id: 'buoyancy', role: 'uniform', schema: BuoyancyField.schema }];
    }
}
