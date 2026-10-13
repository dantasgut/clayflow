import { FieldType } from '../../scene/descriptors/FieldType';
import { StructSchema } from '../../scene/descriptors/StructSchema';

/** Passe de profundidade da sombra: slot, no pool `ShadowMap`, do mapa da luz que projeta. */
export const ShadowDepthParamsSchema = new StructSchema(
    'ShadowDepthParams',
    { casterSlot: FieldType.u32, _pad0: FieldType.u32, _pad1: FieldType.u32, _pad2: FieldType.u32 },
    { addressSpace: 'uniform' },
);

/** Parâmetros de um efeito de pós: `p0 = (strength, aux0, aux1, aux2)`. */
export const EffectParamsSchema = new StructSchema(
    'EffectParams',
    { p0: FieldType.vec4f },
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
