import { NONE } from '../../scene/shaders/engineConstants';
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
        /** Tamanho do alvo em pixels (espessura de linhas do arame, spec 008). */
        viewport: FieldType.vec2f,
        /**
         * Cáusticas da água ligadas (spec 017): 1 multiplica a luz direta pelo mapa de cáusticas abaixo da água vista
         * pela luz; 0 deixa o fator em 1 exato (cenas sem água com cáusticas desenham como antes).
         */
        causticsEnabled: FieldType.f32,
        /**
         * Slot do registro de parâmetros da `CameraFunction` da câmera ativa (spec 009) — lido só pela variante do
         * desenho com projeção de ponto (`camera_project`).
         */
        cameraFnSlot: FieldType.u32,
        /** Tempo simulado (s) — a amostra de superfície das funções `material` (spec 009). */
        time: FieldType.f32,
        /** Preenchimento do layout. */
        _pad1: FieldType.u32,
        _pad2: FieldType.u32,
        _pad3: FieldType.u32,
    },
    { addressSpace: 'uniform' },
);

/** `lightSlot` sem luz que ilumina: o forward usa a direção padrão. */
export const NO_LIGHT_SLOT = NONE.value;

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

/**
 * Desenho de um corpo na superfície de água (spec 017, uma região por corpo, com offset dinâmico): como
 * `ParticleDrawParams` (início da faixa, stride e deslocamento de `pos` em `vec4f`, slot do material no pool
 * `FluidSurfaceMaterial`) mais o raio da esfera de cada partícula em mundo, resolvido na CPU quando o corpo entra.
 */
export const WaterDrawParamsSchema = new StructSchema(
    'WaterDrawParams',
    {
        first: FieldType.u32,
        strideVec4: FieldType.u32,
        posOffsetVec4: FieldType.u32,
        materialSlot: FieldType.u32,
        radius: FieldType.f32,
        _pad0: FieldType.f32,
        _pad1: FieldType.f32,
        _pad2: FieldType.f32,
    },
    { addressSpace: 'uniform' },
);

/**
 * Vista de um produtor de superfície de água (spec 017): câmera (`view` = 0, matrizes do pool `CameraMatrices` no
 * `cameraSlot`) ou luz (`view` = 1, matriz ortográfica do pool `ShadowMatrix` no `shadowSlot`) e o tamanho do alvo.
 */
export const WaterViewParamsSchema = new StructSchema(
    'WaterViewParams',
    {
        cameraSlot: FieldType.u32,
        shadowSlot: FieldType.u32,
        view: FieldType.u32,
        _pad0: FieldType.u32,
        viewport: FieldType.vec2f,
        _pad1: FieldType.f32,
        _pad2: FieldType.f32,
    },
    { addressSpace: 'uniform' },
);

/**
 * Um passo da suavização da superfície de água (spec 017): direção (0 = horizontal, 1 = vertical, 2 e 3 = diagonais) e
 * a vista (escala de pixels por metro tirada da câmera ou da matriz da luz).
 */
export const WaterSmoothParamsSchema = new StructSchema(
    'WaterSmoothParams',
    {
        cameraSlot: FieldType.u32,
        shadowSlot: FieldType.u32,
        view: FieldType.u32,
        direction: FieldType.u32,
        viewport: FieldType.vec2f,
        _pad0: FieldType.f32,
        _pad1: FieldType.f32,
    },
    { addressSpace: 'uniform' },
);

/**
 * Enquadramento da vista da luz da água (spec 017, produzido na GPU): a direção da luz que projeta sombra com a
 * projeção ortográfica ajustada à caixa envolvente da água.
 */
export const WaterLightMatrixSchema = new StructSchema('WaterLightMatrix', {
    viewProj: FieldType.mat4x4f,
});

/**
 * Caixa envolvente da água na base da luz (spec 017): um corpo (faixa, layout da posição, raio) e o slot do mapa de
 * sombra (direção da luz).
 */
export const WaterBoundsParamsSchema = new StructSchema(
    'WaterBoundsParams',
    {
        first: FieldType.u32,
        count: FieldType.u32,
        strideVec4: FieldType.u32,
        posOffsetVec4: FieldType.u32,
        shadowSlot: FieldType.u32,
        radius: FieldType.f32,
        _pad0: FieldType.f32,
        _pad1: FieldType.f32,
    },
    { addressSpace: 'uniform' },
);

/**
 * Cáusticas (spec 017): slot do mapa de sombra da luz, tamanho do mapa de cáusticas (= superfície vista pela luz) e o
 * tempo da cena (ondulações do material).
 */
export const CausticParamsSchema = new StructSchema(
    'CausticParams',
    {
        shadowSlot: FieldType.u32,
        width: FieldType.u32,
        height: FieldType.u32,
        /** Tempo da cena (s): fase das ondulações do material. */
        time: FieldType.f32,
    },
    { addressSpace: 'uniform' },
);

/**
 * Composição da água (spec 017): slots da câmera, da luz e do mapa de sombra, sombra ligada, tamanho do alvo e o tempo
 * da cena (ondulações do material).
 */
export const WaterCompositeParamsSchema = new StructSchema(
    'WaterCompositeParams',
    {
        cameraSlot: FieldType.u32,
        lightSlot: FieldType.u32,
        shadowSlot: FieldType.u32,
        shadowEnabled: FieldType.f32,
        viewport: FieldType.vec2f,
        /** Tempo da cena (s): fase das ondulações do material. */
        time: FieldType.f32,
        _pad1: FieldType.f32,
    },
    { addressSpace: 'uniform' },
);
