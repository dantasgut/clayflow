import { FieldType } from '../../../scene/descriptors/FieldType';
import { extensionRecordSchema } from '../../../scene/descriptors/ExtensionRecord';
import { StructSchema } from '../../../scene/descriptors/StructSchema';

/** Parâmetros do estágio de transformação: número de `Transform`s no pool. */
export const TransformParamsSchema = new StructSchema(
    'TransformParams',
    { count: FieldType.u32, _pad0: FieldType.u32, _pad1: FieldType.u32, _pad2: FieldType.u32 },
    { addressSpace: 'uniform' },
);

/** Elo da hierarquia (spec 007): slot do filho e do pai nos pools `Transform`/`WorldTransform`. */
export const TransformLinkSchema = new StructSchema('TransformLink', {
    child: FieldType.u32,
    parent: FieldType.u32,
});

/** Um nível da hierarquia: início e tamanho do seu trecho na lista de elos (uma região por nível, offset dinâmico). */
export const TransformLevelSchema = new StructSchema(
    'TransformLevel',
    { first: FieldType.u32, count: FieldType.u32, _pad0: FieldType.u32, _pad1: FieldType.u32 },
    { addressSpace: 'uniform' },
);

/** Registro de parâmetros das funções do ponto `transform` (spec 009; um pool para todas as `TransformFunction`). */
export const TransformFnRecordSchema = extensionRecordSchema('TransformFnRecord');

/**
 * Trecho de um grupo de função na lista de pares (slot do Transform, slot do registro) e o tempo simulado — uma região
 * por grupo, com offset dinâmico (spec 009).
 */
export const TransformFnGroupSchema = new StructSchema(
    'TransformFnGroup',
    { first: FieldType.u32, count: FieldType.u32, time: FieldType.f32, _pad0: FieldType.u32 },
    { addressSpace: 'uniform' },
);
