import { FieldType } from '../../../scene/descriptors/FieldType';
import { StructSchema } from '../../../scene/descriptors/StructSchema';

/** Parâmetros do estágio de transformação: número de `Transform`s no pool. */
export const TransformParamsSchema = new StructSchema(
    'TransformParams',
    { count: FieldType.u32, _pad0: FieldType.u32, _pad1: FieldType.u32, _pad2: FieldType.u32 },
    { addressSpace: 'uniform' },
);
