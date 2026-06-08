import type { GPUDescriptor } from '../../../scene/descriptors/GPUDescriptor';
import { FieldType } from '../../../scene/descriptors/FieldType';
import { StructSchema } from '../../../scene/descriptors/StructSchema';
import { ForceField } from './ForceField';

/**
 * Campo de arrasto — frenagem proporcional à velocidade (linear + quadrática).
 * F = -linear·v - quadratic·|v|·v. Simula resistência ao ar/fluido.
 */
export class DragField extends ForceField {
    /** StructSchema do DragField (linearCoeff + quadraticCoeff). */
    static readonly schema = new StructSchema('DragField', {
        linearCoeff: FieldType.f32,
        quadraticCoeff: FieldType.f32,
        _pad0: FieldType.f32,
        _pad1: FieldType.f32,
    });

    constructor(values: Record<string, unknown> = {}) {
        super();
        this.data = DragField.schema.applyDefaults({
            linearCoeff: values.linearCoeff ?? 0.1,
            quadraticCoeff: values.quadraticCoeff ?? 0.01,
        });
    }

    getDescriptors(): readonly GPUDescriptor[] {
        return [{ id: 'drag', role: 'uniform', schema: DragField.schema }];
    }
}
