import {
    FIELD_BUOYANCY,
    FIELD_DRAG,
    FIELD_GRAVITY_POINT,
    FIELD_VORTEX,
    FIELD_WIND,
} from '../../gpu/shaders/constants';
import { Entity } from '../../../scene/contracts/Entity';
import { ResourceState } from '../../../scene/contracts/ResourceState';
import type { Resource } from '../../../scene/contracts/Resource';
import type { GPUDescriptor } from '../../../scene/descriptors/GPUDescriptor';
import type { PipelineDescriptor } from '../../../scene/descriptors/PipelineDescriptor';
import { FieldFnRecordSchema } from '../shaders/fields';

/** Tipo de campo pronto no registro comum (`kind` do `FieldFnRecord`; 0 = fora do laço). */
export const FieldKind = {
    none: 0,
    gravityPoint: FIELD_GRAVITY_POINT.value,
    wind: FIELD_WIND.value,
    vortex: FIELD_VORTEX.value,
    drag: FIELD_DRAG.value,
    buoyancy: FIELD_BUOYANCY.value,
} as const;

/** Valores de um campo pronto no registro comum: tipo e os vetores a, b, s (ver `field_builtin.wgsl`). */
export interface FieldRecordValues {
    readonly kind: number;
    readonly a: readonly number[];
    readonly b: readonly number[];
    readonly s: readonly number[];
}

const bits = new DataView(new ArrayBuffer(4));
const toBits = (v: number): number => {
    bits.setFloat32(0, v, true);
    return bits.getUint32(0, true);
};
const vec4Bits = (v: readonly number[]): number[] => [0, 1, 2, 3].map((k) => toBits(v[k] ?? 0));

/**
 * Base dos campos de força; `TData` tipa o `data` (ver `Entity`). Cada campo ocupa um registro do pool comum
 * `FieldFnRecord` (spec 009), lido por todos os solvers pelo ponto `field`: o tipo e os vetores do registro são
 * calculados do `data` do campo a cada envio (`fieldRecord`) — mudar um campo do `data` vale no quadro seguinte.
 * Troque campos do `data`, não o objeto inteiro (o registro é derivado dele).
 */
export abstract class ForceField<TData extends object = Record<string, unknown>>
    extends Entity<TData>
    implements Resource
{
    state: ResourceState = ResourceState.Uninitialized;

    /** Descritor do registro no pool comum dos campos. */
    protected static readonly recordDescriptor: GPUDescriptor = {
        id: 'record',
        role: 'storage-ro',
        storage: 'pool',
        schema: FieldFnRecordSchema,
    };

    abstract getDescriptors(): readonly GPUDescriptor[];

    getPipelineDescriptors(): readonly PipelineDescriptor[] {
        return [];
    }

    /** Valores do registro a partir do `data` atual. */
    protected abstract fieldRecord(data: Readonly<TData>): FieldRecordValues;

    /**
     * `data` com os campos do registro (`v0`–`v7`, `revision`, `kind`, preenchimentos) como getters derivados de
     * `fieldRecord` — o envio do pool lê os valores atuais.
     */
    protected withRecord(data: TData): TData {
        const record = (): FieldRecordValues => this.fieldRecord(this.rawData);
        const props: PropertyDescriptorMap = {
            v0: { enumerable: true, get: () => vec4Bits(record().a) },
            v1: { enumerable: true, get: () => vec4Bits(record().b) },
            v2: { enumerable: true, get: () => vec4Bits(record().s) },
            kind: { enumerable: true, get: () => record().kind },
            revision: { enumerable: true, value: 0 },
        };
        for (const k of [3, 4, 5, 6, 7]) props[`v${k}`] = { enumerable: true, value: [0, 0, 0, 0] };
        for (const name of ['_pad1', '_pad2'])
            if (!(name in data)) props[name] = { enumerable: true, value: 0 };
        return Object.defineProperties(data, props);
    }
}
