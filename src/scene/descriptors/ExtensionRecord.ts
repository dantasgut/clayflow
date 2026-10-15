import { FieldType } from './FieldType';
import { StructSchema } from './StructSchema';

/** Escalares de um registro de parâmetros de função de ponto (8 × `vec4u`). */
export const EXTENSION_PARAMS_CAPACITY = 32;

/**
 * Schema do registro de parâmetros das funções de um ponto de extensão (spec 009): 32 escalares crus (bits de `f32`,
 * `u32` ou `i32`) e a revisão do código. Um pool por ponto (`TransformFnRecord`, `FieldFnRecord`, …) — uma entidade
 * pode ter funções de pontos diferentes, cada uma no seu pool; o carregador gerado de cada função monta o struct do
 * usuário a partir do registro. Mesmo layout para todos os pontos.
 */
export function extensionRecordSchema(name: string): StructSchema {
    return new StructSchema(name, {
        v0: FieldType.vec4u,
        v1: FieldType.vec4u,
        v2: FieldType.vec4u,
        v3: FieldType.vec4u,
        v4: FieldType.vec4u,
        v5: FieldType.vec4u,
        v6: FieldType.vec4u,
        v7: FieldType.vec4u,
        revision: FieldType.u32,
        _pad0: FieldType.u32,
        _pad1: FieldType.u32,
        _pad2: FieldType.u32,
    });
}
