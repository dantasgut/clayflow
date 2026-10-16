import { finite, noise } from '../../gpu/shaders/math';
import {
    FIELD_BUOYANCY,
    FIELD_DRAG,
    FIELD_GRAVITY_POINT,
    FIELD_VORTEX,
    FIELD_WIND,
} from '../../gpu/shaders/constants';
import { wgslResource } from '../../../scene/shaders/WgslResource';
import { FieldType } from '../../../scene/descriptors/FieldType';
import { StructSchema } from '../../../scene/descriptors/StructSchema';
import { wgslModule } from '../../../scene/shaders/WgslModule';
import { POINT_PARAMS, wgslPoint } from '../../../scene/shaders/WgslPoint';
import fieldPointTypesSource from '../../gpu/wgsl/kernels/field_point_types.wgsl?raw';
import fieldBuiltinSource from '../../gpu/wgsl/kernels/field_builtin.wgsl?raw';
import fieldAccelReadySource from '../../gpu/wgsl/kernels/field_accel_ready.wgsl?raw';
import fieldCheckSource from '../../gpu/wgsl/kernels/field_check.wgsl?raw';
import { combineFieldFunctions } from '../../extension/combineFields';

/**
 * Registro de um campo pronto (spec 031, R8; pool `FieldBuiltinRecord`): o código de tipo (`kind`: as constantes
 * compartilhadas `FIELD_*`; 0 = fora do laço — também o slot livre, que a C2 zera na saída do campo:
 * `clearOnRelease`) e os vetores `a`, `b`, `s` (ver `field_builtin.wgsl`). As funções `field` do usuário têm os
 * registros tipados das suas formas, em pools próprios.
 */
export const FieldBuiltinRecordSchema = new StructSchema('FieldBuiltinRecord', {
    a: FieldType.vec4f,
    b: FieldType.vec4f,
    s: FieldType.vec4f,
    kind: FieldType.u32,
});

/**
 * Recursos dos campos prontos (spec 031): os registros do pool `FieldBuiltinRecord`, global do ponto de cena `field`
 * (a C2 liga o pool ou um substituto zerado). Slots livres são zerados (`kind` 0): sem bitset de vivos — uma ligação de
 * storage a menos em cada solver, para os pools das formas das funções.
 */
export const fieldResources = Object.freeze({
    records: wgslResource({
        name: 'field_builtin_records',
        binding: { storage: 'read' },
        type: { schema: FieldBuiltinRecordSchema, array: true },
        frequency: 'frame',
        provider: { scene: 'field' },
    }),
});

/** Tipos do ponto `field`: `FieldBody`. */
export const fieldPointTypes = wgslModule({
    name: 'field_point_types',
    source: fieldPointTypesSource,
});

/** Campos prontos (gravidade pontual, vento, vórtice, arrasto, empuxo) sobre o global `field_builtin_records`. */
export const fieldBuiltin = wgslModule({
    name: 'field_builtin',
    source: fieldBuiltinSource,
    requires: [
        fieldPointTypes,
        noise,
        fieldResources.records,
        FIELD_GRAVITY_POINT.module,
        FIELD_WIND.module,
        FIELD_VORTEX.module,
        FIELD_DRAG.module,
        FIELD_BUOYANCY.module,
    ],
    structs: [FieldBuiltinRecordSchema],
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
    requires: [
        fieldPointTypes,
        fieldAccelReady,
        wgslResource({
            name: 'field_out',
            binding: { storage: 'read_write' },
            type: { wgsl: 'vec4f', array: true },
            frequency: 'draw',
            provider: 'private',
        }),
    ],
});

/**
 * Ponto `field` (spec 009) — de cena: `fn field_fn(x: vec3f, v: vec3f, time: f32, body: FieldBody, data:
 * FieldFnParams) -> vec3f` (aceleração, m/s²). As funções da cena somam-se aos campos prontos em todo solver que chama
 * `field_accel` (a C2 compõe e troca o pronto). Os kernels declaram o global dos campos prontos
 * (`field_builtin_records: array<FieldBuiltinRecord>`; a C2 o liga); cada função traz o pool da sua forma (registro
 * tipado, spec 031 R8), lido pelo carregador dela. Disponíveis para a função: `noise`.
 */
export const fieldPoint = wgslPoint({
    name: 'field',
    required: {
        name: 'field_fn',
        params: ['vec3f', 'vec3f', 'f32', 'FieldBody', POINT_PARAMS],
        returns: 'vec3f',
        names: ['x', 'v', 'time', 'body', 'data'],
    },
    paramsAlias: 'FieldFnParams',
    ready: fieldAccelReady,
    hosts: () => [fieldCheck],
    scene: {
        globals: { field_builtin_records: { pool: FieldBuiltinRecordSchema } },
        combine: (entries) =>
            combineFieldFunctions(entries, [fieldPointTypes, fieldBuiltin, finite]),
    },
});
