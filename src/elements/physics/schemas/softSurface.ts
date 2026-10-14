import { FieldType } from '../../../scene/descriptors/FieldType';
import { StructSchema } from '../../../scene/descriptors/StructSchema';

/**
 * Parâmetros da superfície de um corpo mole (spec 008, uniform com uma região por corpo): início da faixa do corpo no
 * pool de partículas, layout do registro em `vec4f` (stride e deslocamento do campo `pos`) e o tamanho da malha.
 */
export const SoftSurfaceParamsSchema = new StructSchema(
    'SoftSurfaceParams',
    {
        first: FieldType.u32,
        strideVec4: FieldType.u32,
        posOffsetVec4: FieldType.u32,
        vertexCount: FieldType.u32,
        triangleCount: FieldType.u32,
        _pad0: FieldType.u32,
        _pad1: FieldType.u32,
        _pad2: FieldType.u32,
    },
    { addressSpace: 'uniform' },
);
