import { FieldType } from '../../../scene/descriptors/FieldType';
import { StructSchema } from '../../../scene/descriptors/StructSchema';
import type { EntityRecordDeclaration } from '../../../scene/flows/slots';
import { Light } from '../Light';
import { ShadowMap } from '../ShadowMap';

/** Registro de cada luz com mapa de sombra (spec 007; spec 013: direcional, de foco e pontual): slot da luz e do mapa. */
export const ShadowRecordSchema = new StructSchema('ShadowRecord', {
    lightSlot: FieldType.u32,
    shadowSlot: FieldType.u32,
});

/** Lista dos mapas vivos (grupo único da C2): o estágio percorre só luzes que projetam. */
export const ShadowMatrixInstanceSchema = new StructSchema('ShadowMatrixInstance', {
    record: FieldType.u32,
});

/**
 * Parâmetros do estágio: início e tamanho da lista, a rotação do padrão da penumbra neste quadro (cosseno, seno), o
 * deslocamento das amostras dentro do texel (em texels; spec 034), o slot da câmera ativa no pool das matrizes
 * (`hasCamera` 0 sem câmera: o referencial na origem), o plano distante dela, se o referencial do quadro anterior vale
 * (a série temporal contínua) e o pixel da câmera para o nível das vistas em perspectiva pela resolução na tela (spec
 * 013): o ângulo de um pixel (`pixelAngle`, rad; a câmera em perspectiva) e o tamanho dele (`pixelSize`, m; a
 * ortográfica).
 */
export const ShadowMatrixParamsSchema = new StructSchema(
    'ShadowMatrixParams',
    {
        first: FieldType.u32,
        count: FieldType.u32,
        kernelRotation: FieldType.vec2f,
        texelJitter: FieldType.vec2f,
        cameraSlot: FieldType.u32,
        hasCamera: FieldType.u32,
        far: FieldType.f32,
        previousValid: FieldType.u32,
        pixelAngle: FieldType.f32,
        pixelSize: FieldType.f32,
    },
    { addressSpace: 'uniform' },
);

/** Declaração do registro `ShadowRecord` (slots dos descritores `light` e `shadowmap`). */
export const shadowRecord: EntityRecordDeclaration = {
    schema: ShadowRecordSchema,
    fields: {
        lightSlot: [Light, 'light'],
        shadowSlot: [ShadowMap, 'shadowmap'],
    },
};
