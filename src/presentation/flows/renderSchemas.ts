import { FieldType } from '../../scene/descriptors/FieldType';
import { StructSchema } from '../../scene/descriptors/StructSchema';

/** Passe de profundidade da sombra: slot, no pool `ShadowMap`, do mapa da luz que projeta. */
export const ShadowDepthParamsSchema = new StructSchema(
    'ShadowDepthParams',
    { casterSlot: FieldType.u32, _pad0: FieldType.u32, _pad1: FieldType.u32, _pad2: FieldType.u32 },
    { addressSpace: 'uniform' },
);

/**
 * Lista de instâncias do passe de sombra (spec 007): por instância de um grupo (geometria, orientação), o slot da
 * entidade no pool `WorldTransform`; o shader lê `worlds[instances[instance_index].world]`.
 */
export const ShadowInstanceSchema = new StructSchema('ShadowInstance', { world: FieldType.u32 });

/** Parâmetros de um efeito de pós: `p0 = (strength, aux0, aux1, aux2)`. */
export const EffectParamsSchema = new StructSchema(
    'EffectParams',
    { p0: FieldType.vec4f },
    { addressSpace: 'uniform' },
);

/**
 * Parâmetros da apresentação (spec 011): operador (`toneOperator`: 0 AgX, 1 ACES, 2 neutro, 3 linear), exposição linear (2^EV),
 * pontilhamento (0/1) e saída (0 padrão, 1 HDR estendido).
 */
export const PresentationParamsSchema = new StructSchema(
    'PresentationParams',
    {
        toneOperator: FieldType.u32,
        exposure: FieldType.f32,
        dither: FieldType.u32,
        output: FieldType.u32,
    },
    { addressSpace: 'uniform' },
);

/**
 * Parâmetros da resolução temporal (spec 034): slot da câmera ativa no pool `CameraMatrices` e o modo (1 temporal,
 * 3 acumulação).
 */
export const TemporalResolveParamsSchema = new StructSchema(
    'TemporalResolveParams',
    {
        cameraSlot: FieldType.u32,
        mode: FieldType.u32,
        _pad0: FieldType.u32,
        _pad1: FieldType.u32,
    },
    { addressSpace: 'uniform' },
);

/** Tamanho da tela em pixels (UI). */
export const ScreenParamsSchema = new StructSchema(
    'ScreenParams',
    { size: FieldType.vec2f, _pad: FieldType.vec2f },
    { addressSpace: 'uniform' },
);

/** Quad de UI: retângulo em pixels, cor pré-multiplicada, UV do atlas e flag de textura. */
export const UiQuadSchema = new StructSchema('UiQuad', {
    rect: FieldType.vec4f,
    color: FieldType.vec4f,
    uv: FieldType.vec4f,
    textured: FieldType.vec4f,
});
