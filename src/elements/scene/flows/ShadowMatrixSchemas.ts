import { FieldType } from '../../../scene/descriptors/FieldType';
import { StructSchema } from '../../../scene/descriptors/StructSchema';
import type { EntityRecordDeclaration } from '../../../scene/flows/slots';
import { DirectionalLight } from '../DirectionalLight';
import { ShadowMap } from '../ShadowMap';

/** Registro de cada luz direcional que projeta sombra (spec 007): slot da luz e slot do mapa de sombra. */
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
 * (`hasCamera` 0 sem câmera: o referencial na origem), o plano distante dela e se o referencial do quadro anterior vale
 * (a série temporal contínua).
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
        _pad0: FieldType.vec2f,
    },
    { addressSpace: 'uniform' },
);

/** Declaração do registro `ShadowRecord` (slots dos descritores `light` e `shadowmap`). */
export const shadowRecord: EntityRecordDeclaration = {
    schema: ShadowRecordSchema,
    fields: {
        lightSlot: [DirectionalLight, 'light'],
        shadowSlot: [ShadowMap, 'shadowmap'],
    },
};
