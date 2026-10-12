import { FieldType } from '../../scene/descriptors/FieldType';
import { StructSchema } from '../../scene/descriptors/StructSchema';

/** Sombra lida pelo desenho forward: matriz luz-vista-projeção, direção da luz, viés e liga/desliga. */
export const ForwardShadowParamsSchema = new StructSchema(
    'ForwardShadowParams',
    {
        lightViewProj: FieldType.mat4x4f,
        lightDir: FieldType.vec4f,
        bias: FieldType.f32,
        enabled: FieldType.f32,
        _pad0: FieldType.f32,
        _pad1: FieldType.f32,
    },
    { addressSpace: 'uniform' },
);
