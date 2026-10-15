import { extensionRecordSchema } from '../../scene/descriptors/ExtensionRecord';
import { FieldType } from '../../scene/descriptors/FieldType';
import { StructSchema } from '../../scene/descriptors/StructSchema';

/** Registro de parâmetros das funções do ponto `surface` (spec 009). */
export const SurfaceFnRecordSchema = extensionRecordSchema('SurfaceFnRecord');

/** Registro de parâmetros das funções do ponto `space` (spec 009; ponto de cena). */
export const SpaceFnRecordSchema = extensionRecordSchema('SpaceFnRecord');

/**
 * Parâmetros da avaliação de uma superfície (spec 009): grade, domínio, tempo, passos das diferenças centrais, slot do
 * registro da função e a superfície pronta (tipo e valores).
 */
export const SurfaceParamsSchema = new StructSchema(
    'SurfaceParams',
    {
        nu: FieldType.u32,
        nv: FieldType.u32,
        record_slot: FieldType.u32,
        preset: FieldType.u32,
        u0: FieldType.f32,
        u1: FieldType.f32,
        v0: FieldType.f32,
        v1: FieldType.f32,
        time: FieldType.f32,
        h_u: FieldType.f32,
        h_v: FieldType.f32,
        _pad0: FieldType.f32,
        preset_a: FieldType.vec4f,
    },
    { addressSpace: 'uniform' },
);
