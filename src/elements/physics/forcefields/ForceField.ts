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
import { FieldBuiltinRecordSchema } from '../shaders/fields';

/** Tipo de campo pronto no registro (`kind` do `FieldBuiltinRecord`; 0 = fora do laço). */
export const FieldKind = {
    none: 0,
    gravityPoint: FIELD_GRAVITY_POINT.value,
    wind: FIELD_WIND.value,
    vortex: FIELD_VORTEX.value,
    drag: FIELD_DRAG.value,
    buoyancy: FIELD_BUOYANCY.value,
} as const;

/** Valores de um campo pronto no registro: tipo e os vetores a, b, s (ver `field_builtin.wgsl`). */
export interface FieldRecordValues {
    readonly kind: number;
    readonly a: readonly number[];
    readonly b: readonly number[];
    readonly s: readonly number[];
}

/** Vetor de 4 componentes (as ausentes valem 0). */
const vec4 = (v: readonly number[]): number[] => [0, 1, 2, 3].map((k) => v[k] ?? 0);

/**
 * Base dos campos de força; `TData` tipa o `data` (ver `Entity`). Cada campo ocupa um registro do pool
 * `FieldBuiltinRecord` (spec 031, R8), lido por todos os solvers pelo ponto `field`: o tipo e os vetores do registro
 * são calculados do `data` do campo a cada envio (`fieldRecord`) — mudar um campo do `data` vale no quadro seguinte.
 * Troque campos do `data`, não o objeto inteiro (o registro é derivado dele).
 */
export abstract class ForceField<TData extends object = Record<string, unknown>>
    extends Entity<TData>
    implements Resource
{
    state: ResourceState = ResourceState.Uninitialized;

    /** Descritor do registro no pool dos campos prontos (slot zerado na saída: `kind` 0, fora do laço). */
    protected static readonly recordDescriptor: GPUDescriptor = {
        id: 'record',
        role: 'storage-ro',
        storage: 'pool',
        schema: FieldBuiltinRecordSchema,
        clearOnRelease: true,
    };

    abstract getDescriptors(): readonly GPUDescriptor[];

    getPipelineDescriptors(): readonly PipelineDescriptor[] {
        return [];
    }

    /** Valores do registro a partir do `data` atual. */
    protected abstract fieldRecord(data: Readonly<TData>): FieldRecordValues;

    /**
     * `data` com os campos do registro `FieldBuiltinRecord` (`a`, `b`, `s`, `kind`) como getters derivados de
     * `fieldRecord` — o envio do pool lê os valores atuais.
     */
    protected withRecord(data: TData): TData {
        const record = (): FieldRecordValues => this.fieldRecord(this.rawData);
        return Object.defineProperties(data, {
            a: { enumerable: true, get: () => vec4(record().a) },
            b: { enumerable: true, get: () => vec4(record().b) },
            s: { enumerable: true, get: () => vec4(record().s) },
            kind: { enumerable: true, get: () => record().kind },
        });
    }
}
