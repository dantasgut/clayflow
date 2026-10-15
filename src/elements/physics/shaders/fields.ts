import { poolLive } from '../../gpu/compute/shaders';
import { noise } from '../../gpu/shaders/math';
import { extensionRecordSchema } from '../../../scene/descriptors/ExtensionRecord';
import { wgslModule } from '../../../scene/shaders/WgslModule';
import { POINT_PARAMS, wgslPoint } from '../../../scene/shaders/WgslPoint';
import fieldPointTypesSource from '../../gpu/wgsl/kernels/field_point_types.wgsl?raw';
import fieldBuiltinSource from '../../gpu/wgsl/kernels/field_builtin.wgsl?raw';
import fieldAccelReadySource from '../../gpu/wgsl/kernels/field_accel_ready.wgsl?raw';
import fieldCheckSource from '../../gpu/wgsl/kernels/field_check.wgsl?raw';
import { combineFieldFunctions } from '../../extension/combineFields';

/**
 * Registro dos campos (spec 009): o mesmo pool para os campos prontos (tipo em `kind`, valores em v0–v2) e para os
 * parâmetros das `FieldFunction` (tipo 0).
 */
export const FieldFnRecordSchema = extensionRecordSchema('FieldFnRecord');

/** Tipos do ponto `field`: `FieldBody`. */
export const fieldPointTypes = wgslModule({
    name: 'field_point_types',
    source: fieldPointTypesSource,
});

/** Campos prontos (gravidade pontual, vento, vórtice, arrasto, empuxo) sobre os globais `field_records`/`field_live`. */
export const fieldBuiltin = wgslModule({
    name: 'field_builtin',
    source: fieldBuiltinSource,
    requires: [fieldPointTypes, noise, poolLive],
    structs: [FieldFnRecordSchema],
});

/** `field_accel` pronto: os campos prontos. */
export const fieldAccelReady = wgslModule({
    name: 'field_accel_ready',
    source: fieldAccelReadySource,
    requires: [fieldPointTypes, fieldBuiltin],
});

/** Kernel de validação das `FieldFunction` (monta `field_accel` com os globais dos solvers; não é despachado). */
export const fieldCheck = wgslModule({
    name: 'field_check',
    source: fieldCheckSource,
    requires: [fieldPointTypes, fieldAccelReady],
    structs: [FieldFnRecordSchema],
});

/**
 * Ponto `field` (spec 009) — de cena: `fn field_fn(x: vec3f, v: vec3f, time: f32, body: FieldBody, data:
 * FieldFnParams) -> vec3f` (aceleração, m/s²). As funções da cena somam-se aos campos prontos em todo solver que chama
 * `field_accel` (a C2 compõe e troca o pronto). Os kernels declaram os globais `field_records: array<FieldFnRecord>` e
 * `field_live: array<u32>`; a C2 os liga. Disponíveis para a função: `noise`.
 */
export const fieldPoint = wgslPoint({
    name: 'field',
    required: {
        name: 'field_fn',
        params: ['vec3f', 'vec3f', 'f32', 'FieldBody', POINT_PARAMS],
        returns: 'vec3f',
    },
    paramsAlias: 'FieldFnParams',
    record: FieldFnRecordSchema,
    ready: fieldAccelReady,
    hosts: () => [fieldCheck],
    scene: {
        globals: {
            field_records: { pool: FieldFnRecordSchema },
            field_live: { pool: FieldFnRecordSchema, part: 'live' },
        },
        combine: (entries) => combineFieldFunctions(entries, [fieldPointTypes, fieldBuiltin]),
    },
});
