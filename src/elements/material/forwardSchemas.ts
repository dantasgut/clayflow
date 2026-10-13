import { FieldType } from '../../scene/descriptors/FieldType';
import { StructSchema } from '../../scene/descriptors/StructSchema';

/**
 * Parâmetros do quadro do desenho forward (uniform privado do estágio, escrito quando mudam): direção da luz que
 * ilumina, sombra ligada, o slot do mapa de sombra dela no pool `ShadowMap` (matriz e viés vêm de lá) e o slot da
 * câmera ativa no pool `CameraMatrices` (spec 007).
 */
export const ForwardFrameParamsSchema = new StructSchema(
    'ForwardFrameParams',
    {
        lightDir: FieldType.vec4f,
        shadowEnabled: FieldType.f32,
        shadowSlot: FieldType.u32,
        cameraSlot: FieldType.u32,
        _pad1: FieldType.f32,
    },
    { addressSpace: 'uniform' },
);
