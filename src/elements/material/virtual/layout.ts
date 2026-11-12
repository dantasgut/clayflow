// Texturas virtuais dos materiais (spec 034, T060c): a disposição das páginas, comum à CPU (os índices) e à GPU
// (`vt_common.wgsl`) — os tamanhos da página, os níveis da pirâmide e a ordem das páginas virtuais de uma imagem (nível
// a nível, linha a linha). Só índices: nenhum texel passa por aqui. A referência f64 (`reference/virtualTexture.ts`) tem
// as mesmas regras, escritas à parte; os testes as comparam.

/** Texels por lado do conteúdo de uma página. */
export const VT_PAGE_PAYLOAD = 120;
/** Borda de cada lado da página no atlas (os vizinhos: a filtragem bilinear não atravessa a página ao lado). */
export const VT_PAGE_BORDER = 4;
/** Texels por lado de uma página no atlas: o conteúdo e as bordas (128; a linha de 512 bytes da cópia). */
export const VT_PAGE_STRIDE = VT_PAGE_PAYLOAD + 2 * VT_PAGE_BORDER;
/** Níveis no máximo (imagem de até 32 768 por lado). */
export const VT_MAX_LEVELS = 16;
/** Maior lado aceito (o limite de `VT_MAX_LEVELS`). */
export const VT_MAX_SIDE = 1 << (VT_MAX_LEVELS - 1);
/** Lado do bloco da preparação na GPU (texels do nível de entrada por despacho; `vt_prepare.wgsl`). */
export const VT_PREP_BLOCK = 1024;
/** Níveis reduzidos por bloco na preparação (do bloco de 1024² ao texel único). */
export const VT_PREP_LEVELS = 10;

/** Endereçamento fora de [0, 1]: repetir (o padrão dos materiais) ou prender na borda. */
export type VirtualWrap = 'repeat' | 'clamp';

/** Codificação dos valores: cor em sRGB (decodificada para luz linear) ou dado linear (rugosidade, normais, máscaras). */
export type VirtualColorSpace = 'srgb' | 'linear';

/** Número de níveis da pirâmide de uma imagem `width × height` (até 1 × 1). */
export function vtLevelCount(width: number, height: number): number {
    return 32 - Math.clz32(Math.max(width, height));
}

/** Lado do nível `level` (o anterior dividido por dois, no mínimo 1). */
export function vtSizeOfLevel(width: number, height: number, level: number): [number, number] {
    return [Math.max(1, width >> level), Math.max(1, height >> level)];
}

/** Páginas por eixo do nível `level`. */
export function vtPagesOfLevel(width: number, height: number, level: number): [number, number] {
    const [w, h] = vtSizeOfLevel(width, height, level);
    return [Math.ceil(w / VT_PAGE_PAYLOAD), Math.ceil(h / VT_PAGE_PAYLOAD)];
}

/** Palavras de 32 bits da saída de um bloco da preparação: os níveis 1 a `VT_PREP_LEVELS` do bloco, em ordem. */
export function vtPrepOffset(level: number): number {
    let offset = 0;
    for (let k = 1; k < level; k++) offset += (VT_PREP_BLOCK >> k) ** 2;
    return offset;
}
