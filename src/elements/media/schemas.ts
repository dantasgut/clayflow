import { FieldType } from '../../scene/descriptors/FieldType';
import { StructSchema } from '../../scene/descriptors/StructSchema';

/** Froxels por eixo (x, y na tela; z em fatias exponenciais da profundidade), R12. */
export const FROXEL_GRID = [160, 90, 128] as const;
/** Células da grade da luz ambiente por eixo (a dos froxels a cada 4 por eixo: a luz rebatida varia devagar). */
export const FROXEL_AMBIENT_GRID = [40, 23, 32] as const;
/** Distância mínima da primeira fatia (m): a névoa mais perto que isso é tratada como na primeira fatia. */
export const FROXEL_NEAR = 0.1;
/** Peso do histórico no acúmulo dos froxels (reprojetado; o quadro novo entra com o resto). */
export const FROXEL_HISTORY = 0.9;
/** Passos da marcha nos meios de densidade variável (raios e a luz que chega aos froxels). */
export const MEDIA_MARCH_STEPS = 8;

/** Forma de um `FogVolume` (código no registro). */
export const FOG_SHAPE = { box: 0, sphere: 1 } as const;
/** Densidade de um `FogVolume` (código no registro). */
export const FOG_DENSITY = { constant: 0, function: 1, grid: 2 } as const;

/**
 * Registro de um `FogVolume` (pool, R12): `shape` = (forma, tipo da densidade, índice da função na composição, 0);
 * `center` (xyz, w = largura da borda suave); `extent` = meias-medidas da caixa (xyz) ou o raio (x); `optics` = (extinção
 * na densidade 1, anisotropia de Henyey-Greenstein, 0, 0); `albedo` (rgb, a = 1 vivo — o slot liberado volta a 0);
 * `emission` (rgb: a radiância de uma névoa opticamente espessa); `gridSize` = (nx, ny, nz, 0); `fnSlot` = o slot do
 * registro da `DensityFunction` (resolvido pela C2); `gridFirst` = o primeiro valor da grade no pool `FogGrid`
 * (resolvido pela C2).
 */
export const FogVolumeSchema = new StructSchema('FogVolume', {
    shape: FieldType.vec4u,
    center: FieldType.vec4f,
    extent: FieldType.vec4f,
    optics: FieldType.vec4f,
    albedo: FieldType.vec4f,
    emission: FieldType.vec4f,
    gridSize: FieldType.vec4u,
    fnSlot: FieldType.u32,
    gridFirst: FieldType.u32,
    _pad0: FieldType.u32,
    _pad1: FieldType.u32,
});

/** Valor de densidade de uma grade (pool `FogGrid`: os valores dos volumes por grade, contíguos por volume). */
export const FogGridSchema = new StructSchema('FogGrid', { value: FieldType.f32 });

/**
 * Parâmetros dos froxels (uniform, R12): `grid` = (x, y, z, slot da câmera); `depth` = (distância da primeira fatia, da
 * última, ln(última/primeira), 1 com névoa no quadro); `frame` = (jitter x, y, z em [0, 1), tempo); `counts` = (slots do
 * pool dos volumes, slots das luzes, quadro, 1 com histórico válido). A câmera (matrizes e posição) vem do pool
 * `CameraMatrices` pelo slot.
 */
export const FroxelsSchema = new StructSchema(
    'Froxels',
    {
        grid: FieldType.vec4u,
        depth: FieldType.vec4f,
        frame: FieldType.vec4f,
        counts: FieldType.vec4u,
    },
    { addressSpace: 'uniform' },
);
