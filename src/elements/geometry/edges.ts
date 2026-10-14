import { FieldType } from '../../scene/descriptors/FieldType';
import { StructSchema } from '../../scene/descriptors/StructSchema';

/** Parâmetros do kernel de arestas: número de triângulos e o formato dos índices de triângulo. */
export const EdgeParamsSchema = new StructSchema(
    'EdgeParams',
    {
        triangleCount: FieldType.u32,
        /** 1 = índices `uint16` (dois por palavra). */
        indices16: FieldType.u32,
        _pad0: FieldType.u32,
        _pad1: FieldType.u32,
    },
    { addressSpace: 'uniform' },
);
