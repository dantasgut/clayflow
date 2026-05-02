import type { GPUDescriptor } from '../../../scene/descriptors/GPUDescriptor';
import { FieldType } from '../../../scene/descriptors/FieldType';
import { StructSchema } from '../../../scene/descriptors/StructSchema';
import { ForceField } from './ForceField';

/**
 * Campo de empuxo — Princípio de Arquimedes. Aplica força vertical
 * proporcional ao volume submerso × fluidDensity × gravity. Bodies
 * acima do fluidLevel não recebem empuxo.
 */
export class BuoyancyField extends ForceField {
    /** StructSchema do BuoyancyField (fluidDensity + fluidLevel + gravity). */
    static readonly schema = new StructSchema('BuoyancyField', {
        fluidDensity: FieldType.f32,
        fluidLevel: FieldType.f32,
        gravity: FieldType.f32,
        _pad: FieldType.f32,
    });

    constructor(values: Record<string, unknown> = {}) {
        super();
        this.data = BuoyancyField.schema.applyDefaults({
            fluidDensity: values.fluidDensity ?? 1000.0,
            fluidLevel: values.fluidLevel ?? 0.0,
            gravity: values.gravity ?? 9.81,
        });
    }

    getDescriptors(): readonly GPUDescriptor[] {
        return [{ id: 'buoyancy', role: 'uniform', schema: BuoyancyField.schema }];
    }
}
