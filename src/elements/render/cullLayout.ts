// O arranjo da hierarquia de profundidade (Hi-Z) e os parâmetros do descarte do desenho conduzido pela GPU (spec 034,
// T060d): os mesmos valores de `presentation/flows/draw_cull.wgsl` e `particle_cull.wgsl`. A referência f64
// (`reference/drawCull.ts`) usa estes.

/** Lado do nível 0 da hierarquia de profundidade (texels): fixo, independente do canvas (múltiplos de 16). */
export const HZB_WIDTH = 512;
export const HZB_HEIGHT = 256;
/** Teto de pixels por eixo cobertos por um texel do nível 0 (canvas até 16 × 512 de largura); acima, o texel é longe. */
export const HZB_SPAN_MAX = 16;
/** Níveis montados pelo grupo de 16 × 16 do nível 0 (0 a 4); os de cima, por um grupo só. */
export const HZB_TILE_LEVELS = 5;
/** Abaixo deste `w` um canto da caixa está no plano da câmera ou atrás dele: a caixa conta como visível. */
export const CULL_NEAR_W = 1e-5;
/**
 * Folga da profundidade no teste de oclusão (2⁻²⁰): a face da própria caixa no alvo (24 bits, arredondada) não a esconde.
 * Conservadora: o que fica atrás por menos que isso desenha.
 */
export const CULL_DEPTH_BIAS = 2 ** -20;

/** Níveis da hierarquia até 1 × 1. */
export function hzbLevels(width = HZB_WIDTH, height = HZB_HEIGHT): number {
    return Math.floor(Math.log2(Math.max(width, height))) + 1;
}

/** Lados do nível `k`. */
export function hzbLevelSize(k: number, width = HZB_WIDTH, height = HZB_HEIGHT): [number, number] {
    return [Math.max(1, width >> k), Math.max(1, height >> k)];
}

/** Primeira posição do nível `k` na hierarquia (os níveis em sequência). */
export function hzbLevelOffset(k: number, width = HZB_WIDTH, height = HZB_HEIGHT): number {
    let offset = 0;
    for (let j = 0; j < k; j++) {
        const [w, h] = hzbLevelSize(j, width, height);
        offset += w * h;
    }
    return offset;
}

/** Palavras da hierarquia inteira. */
export function hzbWords(width = HZB_WIDTH, height = HZB_HEIGHT): number {
    return hzbLevelOffset(hzbLevels(width, height), width, height);
}

/** A cada quantos quadros a oclusão desligada é experimentada de novo. */
export const CULL_PROBE_PERIOD = 64;
/** A oclusão vale quando esconde ao menos 1/20 do que passa pelo tronco (o custo da hierarquia se paga). */
export const CULL_USEFUL_DIVISOR = 20;
