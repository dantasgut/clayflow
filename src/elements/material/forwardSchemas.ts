import { FieldType } from '../../scene/descriptors/FieldType';
import { StructSchema } from '../../scene/descriptors/StructSchema';

/**
 * Parâmetros do quadro do desenho forward (uniform privado do estágio, escrito quando mudam): direção da luz que
 * ilumina, sombra ligada e o slot do mapa de sombra dela no pool `ShadowMap` (matriz e viés vêm de lá).
 */
export const ForwardFrameParamsSchema = new StructSchema(
    'ForwardFrameParams',
    {
        lightDir: FieldType.vec4f,
        shadowEnabled: FieldType.f32,
        shadowSlot: FieldType.u32,
        _pad0: FieldType.f32,
        _pad1: FieldType.f32,
    },
    { addressSpace: 'uniform' },
);
