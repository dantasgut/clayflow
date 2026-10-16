import { FieldType } from '../../scene/descriptors/FieldType';
import { StructSchema } from '../../scene/descriptors/StructSchema';

/**
 * Parâmetros de um passo de um emissor (spec 009; uma região por passo, offset dinâmico): o anel (início, criadas no
 * passo, índice global, capacidade), o tempo e o passo, a semente, o slot do registro da função, a gravidade, a vida e
 * a forma pronta (tipo e vetores).
 */
export const EmitterParamsSchema = new StructSchema(
    'EmitterParams',
    {
        head: FieldType.u32,
        spawn_count: FieldType.u32,
        emitted: FieldType.u32,
        capacity: FieldType.u32,
        time: FieldType.f32,
        dt: FieldType.f32,
        seed: FieldType.u32,
        record_slot: FieldType.u32,
        gravity: FieldType.vec3f,
        lifetime: FieldType.f32,
        shape_kind: FieldType.u32,
        _pad0: FieldType.u32,
        _pad1: FieldType.u32,
        _pad2: FieldType.u32,
        shape_a: FieldType.vec4f,
        shape_b: FieldType.vec4f,
        shape_s: FieldType.vec4f,
    },
    { addressSpace: 'uniform' },
);
