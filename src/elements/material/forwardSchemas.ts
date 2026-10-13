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

/**
 * Desenho de um corpo de partículas em sprites (spec 008, uma região por corpo, com offset dinâmico): o primeiro slot da
 * faixa do corpo no pool, o stride do registro e o deslocamento do campo `pos` em `vec4f` (o pool é lido como
 * `array<vec4f>`, o mesmo shader para todo schema de partícula) e o slot do material no pool `PointSpriteMaterial`.
 */
export const ParticleDrawParamsSchema = new StructSchema(
    'ParticleDrawParams',
    {
        first: FieldType.u32,
        strideVec4: FieldType.u32,
        posOffsetVec4: FieldType.u32,
        materialSlot: FieldType.u32,
    },
    { addressSpace: 'uniform' },
);
