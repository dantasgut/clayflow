import { FieldType } from '../../scene/descriptors/FieldType';
import { StructSchema } from '../../scene/descriptors/StructSchema';

/**
 * Parâmetros do quadro do desenho forward (uniform privado do estágio, escrito quando mudam): o slot da câmera ativa no
 * pool `CameraMatrices`, o slot da luz que ilumina no pool `Light` (a direção vem de lá; `0xFFFFFFFF` = direção padrão),
 * sombra ligada e o slot do mapa de sombra dela nos pools `ShadowMap` (vieses) e `ShadowMatrix` (matriz) — spec 007.
 */
export const ForwardFrameParamsSchema = new StructSchema(
    'ForwardFrameParams',
    {
        cameraSlot: FieldType.u32,
        lightSlot: FieldType.u32,
        shadowEnabled: FieldType.f32,
        shadowSlot: FieldType.u32,
    },
    { addressSpace: 'uniform' },
);

/** `lightSlot` sem luz que ilumina: o forward usa a direção padrão. */
export const NO_LIGHT_SLOT = 0xffffffff;
