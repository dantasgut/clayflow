import { FieldType } from '../../../scene/descriptors/FieldType';
import { StructSchema } from '../../../scene/descriptors/StructSchema';

/**
 * Uniforme da camada de nuvens (spec 041, R1–R12), escrito pelos estágios das nuvens a cada quadro (empacotamento dos
 * valores da `CloudLayer`, do `Sky` e da câmera): a casca (raio do chão da cena, base, topo, espessura; m), a camada
 * (cobertura, tipo, extinção, albedo), a fase (g_HG, g_D, α, w_D), as oitavas (quantas, a, b, c), os deslocamentos do
 * vento da forma e do detalhe (m, reduzidos módulo o período em f64; `w` a escala), o vento (direção unitária xz e
 * velocidade xz em m/s), o mapa de cobertura (centro xz, lado, tempo) e o deslocamento dele, o referencial do mapa
 * visto do sol (centro e lado; direita e a distância da origem dos raios; cima; a direção do sol), a marcha (passos,
 * passos de luz, quadro de Bayer, slot da câmera), as marcas (histórico válido, slots das funções de forma e de
 * cobertura), os tempos (Δt, passos do panorama) e a posição da câmera do panorama.
 */
export const CloudSchema = new StructSchema(
    'CloudLayer',
    {
        shell: FieldType.vec4f,
        layer: FieldType.vec4f,
        phase: FieldType.vec4f,
        octaves: FieldType.vec4f,
        shape: FieldType.vec4f,
        detail: FieldType.vec4f,
        wind: FieldType.vec4f,
        coverageMap: FieldType.vec4f,
        coverageOffset: FieldType.vec4f,
        sunFrame: FieldType.vec4f,
        sunRight: FieldType.vec4f,
        sunUp: FieldType.vec4f,
        sunDir: FieldType.vec4f,
        march: FieldType.vec4u,
        flags: FieldType.vec4u,
        timing: FieldType.vec4f,
        eye: FieldType.vec4f,
    },
    { addressSpace: 'uniform' },
);

/** Lado dos volumes de ruído (texels por eixo): a forma e o detalhe (spec 041, R3). */
export const CLOUD_SHAPE_SIZE = 128;
export const CLOUD_DETAIL_SIZE = 32;
/** Texels por lado do mapa de cobertura (R4). */
export const CLOUD_COVERAGE_SIZE = 512;

/**
 * Coeficientes das oitavas do espalhamento múltiplo (R8: `Σ bⁱ σs e^(−aⁱ τ) p(cⁱ g)`), calibrados contra o traçador de
 * referência (T023, `octaves.calibration.test.ts`: o menor erro médio na grade, 31,9 % — o limite do modelo de oitavas
 * contra o transporte completo numa nuvem espessa; ver research.md, R8).
 */
export const CLOUD_OCTAVES = { a: 0.35, b: 0.95, c: 0.6 } as const;

/** Qualidade das nuvens num perfil do `Renderer` (spec 041, R15). */
export interface CloudQuality {
    /** Teto de passos de densidade da marcha principal. */
    readonly steps: number;
    /** Passos de luz por passo denso (o cone até o sol). */
    readonly lightSteps: number;
    /** Oitavas do espalhamento múltiplo. */
    readonly octaves: number;
    /** Texels do panorama (largura, altura). */
    readonly panorama: readonly [number, number];
    /** Passos da marcha do panorama. */
    readonly panoramaSteps: number;
    /** Mapa visto do sol: texels por lado e lado (m). */
    readonly shadow: { readonly size: number; readonly extent: number };
    /** Lado (m) do mapa de cobertura. */
    readonly coverageExtent: number;
}
