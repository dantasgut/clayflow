import { FieldType } from '../../scene/descriptors/FieldType';
import { StructSchema } from '../../scene/descriptors/StructSchema';

/**
 * Parâmetros do quadro do desenho forward (uniform privado do estágio, escrito quando mudam): o slot da câmera ativa no
 * pool `CameraMatrices`, o tamanho do alvo, o slot do registro da função de projeção da câmera e o tempo. A luz, a
 * sombra e a água chegam pelos pontos de cena (spec 031), não pelo quadro.
 */
export const ForwardFrameParamsSchema = new StructSchema(
    'ForwardFrameParams',
    {
        cameraSlot: FieldType.u32,
        /**
         * Slot do registro de parâmetros da `CameraFunction` da câmera ativa (spec 009) — lido só pela variante do
         * desenho com projeção de ponto (`camera_project`).
         */
        cameraFnSlot: FieldType.u32,
        /** Tamanho do alvo em pixels (espessura de linhas do arame, spec 008). */
        viewport: FieldType.vec2f,
        /** Tempo simulado (s) — a amostra de superfície das funções `material` (spec 009). */
        time: FieldType.f32,
        /**
         * 1 com o antisserrilhado temporal (spec 034): o alfa da cor leva a luz que chega ao ponto (a radiância refletida
         * sobre a refletância do fechamento), que a resolução compara com a do quadro anterior; 0: o alfa é a opacidade.
         */
        lightSignal: FieldType.u32,
        /** Preenchimento do layout. */
        _pad2: FieldType.u32,
        _pad3: FieldType.u32,
    },
    { addressSpace: 'uniform' },
);

/**
 * Parâmetros do quadro do desenho de partículas (uniform privado do `ParticleFlow`): o slot da câmera ativa. A luz dos
 * sprites vem do ponto de cena `scene_lighting` (spec 011).
 */
export const ParticleFrameParamsSchema = new StructSchema(
    'ParticleFrameParams',
    {
        cameraSlot: FieldType.u32,
        _pad0: FieldType.u32,
        _pad1: FieldType.u32,
        _pad2: FieldType.u32,
    },
    { addressSpace: 'uniform' },
);

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
