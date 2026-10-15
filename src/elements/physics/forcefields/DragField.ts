import type { GPUDescriptor } from '../../../scene/descriptors/GPUDescriptor';
import { FieldType } from '../../../scene/descriptors/FieldType';
import { StructSchema } from '../../../scene/descriptors/StructSchema';
import { FieldKind, ForceField, type FieldRecordValues } from './ForceField';

/** Dado de um `DragField` (layout de `DragField.schema`). */
export interface DragFieldData {
    /** Coeficiente linear. */
    linearCoeff: number;
    /** Coeficiente quadrático. */
    quadraticCoeff: number;
    /** Preenchimento do layout. */
    _pad0: number;
    /** Preenchimento do layout. */
    _pad1: number;
}

/**
 * Campo de arrasto — frenagem proporcional à velocidade (linear + quadrática).
 * F = -linear·v - quadratic·|v|·v. Simula resistência ao ar/fluido.
 */
export class DragField extends ForceField<DragFieldData> {
    /** StructSchema do DragField (linearCoeff + quadraticCoeff). */
    static readonly schema = new StructSchema('DragField', {
        linearCoeff: FieldType.f32,
        quadraticCoeff: FieldType.f32,
        _pad0: FieldType.f32,
        _pad1: FieldType.f32,
    });

    constructor(values: Partial<DragFieldData> = {}) {
        super();
        this.data = this.withRecord({
            linearCoeff: values.linearCoeff ?? 0.1,
            quadraticCoeff: values.quadraticCoeff ?? 0.01,
            _pad0: 0,
            _pad1: 0,
        });
    }

    getDescriptors(): readonly GPUDescriptor[] {
        return [ForceField.recordDescriptor];
    }

    /** Arrasto (spec 009): aceleração −(linear + quadrático · |v|) · v. */
    protected fieldRecord(d: Readonly<DragFieldData>): FieldRecordValues {
        return { kind: FieldKind.drag, a: [], b: [], s: [d.linearCoeff, d.quadraticCoeff, 0, 0] };
    }
}
