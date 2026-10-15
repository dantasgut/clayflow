import type { GPUDescriptor } from '../../../scene/descriptors/GPUDescriptor';
import { FieldType } from '../../../scene/descriptors/FieldType';
import { StructSchema } from '../../../scene/descriptors/StructSchema';
import { FieldKind, ForceField, type FieldRecordValues } from './ForceField';

/** Dado de um `GravityField` (layout de `GravityField.schema`). */
export interface GravityFieldData {
    /** Modo da fonte: 0 uniforme, 1 pontual. */
    sourceMode: number;
    /** Preenchimento do layout. */
    _pad0: number;
    /** Preenchimento do layout. */
    _pad1: number;
    /** Preenchimento do layout. */
    _pad2: number;
    /** Aceleração (m/s²). */
    acceleration: readonly number[];
    /** Posição da fonte pontual. */
    sourcePosition: readonly number[];
    /** Massa da fonte pontual. */
    sourceMass: number;
    /** Constante gravitacional G. */
    gravitationalConstant: number;
    /** Preenchimento do layout. */
    _pad3: number;
    /** Preenchimento do layout. */
    _pad4: number;
}

/**
 * Campo gravitacional — uniforme (acceleration constante) ou point-source
 * (Newton: F = G·m·M/r²) conforme `sourceMode`. Aplicado a todos os physics
 * bodies pelo flow.
 */
export class GravityField extends ForceField<GravityFieldData> {
    /** StructSchema do GravityField (uniform de 64 bytes). */
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

    constructor(values: Partial<GravityFieldData> = {}) {
        super();
        this.data = this.withRecord({
            sourceMode: values.sourceMode ?? 0,
            _pad0: 0,
            _pad1: 0,
            _pad2: 0,
            acceleration: values.acceleration ?? [0, -9.81, 0, 0],
            sourcePosition: values.sourcePosition ?? [0, 0, 0, 1],
            sourceMass: values.sourceMass ?? 0,
            gravitationalConstant: values.gravitationalConstant ?? 6.674e-11,
            _pad3: 0,
            _pad4: 0,
        });
    }

    getDescriptors(): readonly GPUDescriptor[] {
        return [
            { id: 'gravity', role: 'uniform', schema: GravityField.schema },
            ForceField.recordDescriptor,
        ];
    }

    /**
     * Gravidade uniforme que os solvers somam (m/s²): `acceleration`, ou zero com fonte pontual (`sourceMode = 1`) —
     * aí a atração vem do registro do campo (ponto `field`, spec 009).
     */
    uniformAcceleration(): readonly number[] {
        return this.rawData.sourceMode === 1 ? [0, 0, 0, 0] : this.rawData.acceleration;
    }

    /** Fonte pontual (spec 009): atração G·M / r² para a posição da fonte; uniforme fica fora do laço. */
    protected fieldRecord(d: Readonly<GravityFieldData>): FieldRecordValues {
        if (d.sourceMode !== 1) return { kind: FieldKind.none, a: [], b: [], s: [] };
        return {
            kind: FieldKind.gravityPoint,
            a: [...d.sourcePosition],
            b: [],
            s: [d.gravitationalConstant * d.sourceMass, 1e-4, 0, 0],
        };
    }
}
