import {
    VT_MAX_SIDE,
    vtLevelBases,
    vtLevelPages,
    vtLevels,
    vtPageTexels,
    vtPyramid,
    type VirtualColorSpace,
    type VirtualPyramid,
    type VirtualWrap,
} from './reference/virtualTexture';

/** Valores de uma `VirtualImage`. */
export interface VirtualImageValues {
    /** Largura em pixels (até 32 768). */
    readonly width: number;
    /** Altura em pixels (até 32 768). */
    readonly height: number;
    /**
     * Os valores por pixel, RGBA de 8 bits (a primeira linha é a de v = 0), `width × height × 4` bytes — o que a
     * aplicação decodificou do arquivo (PNG, JPEG…): o motor não lê arquivos.
     */
    readonly pixels: Uint8Array;
    /** Fora de [0, 1]: repetir (padrão) ou prender na borda. */
    readonly wrap?: VirtualWrap;
    /**
     * Cor em sRGB (padrão: decodificada para luz linear antes da filtragem) ou dado linear (rugosidade, metal, normais,
     * máscaras: filtrado como está).
     */
    readonly colorSpace?: VirtualColorSpace;
}

/**
 * Imagem de material lida por páginas (spec 034, T060c — texturas virtuais): a pirâmide de níveis (a média 2 × 2 em luz
 * linear, 8 bits na codificação da imagem) fica na CPU, e só as páginas que os quadros pedem vão ao atlas das `VirtualTextures` da cena —
 * a imagem pode ser maior que a memória de GPU reservada a ela. Entra na cena por `VirtualTextures` (`images` ou `addImage`: o índice que o nó
 * `nodes.image.virtual` recebe); não é uma entidade.
 */
export class VirtualImage {
    readonly width: number;
    readonly height: number;
    readonly wrap: VirtualWrap;
    readonly colorSpace: VirtualColorSpace;
    /** Níveis da pirâmide. */
    readonly levels: number;
    /** A primeira página de cada nível (relativa à imagem) e o total de páginas virtuais. */
    readonly bases: readonly number[];
    readonly pages: number;
    /** A pirâmide (sRGB de 8 bits por nível). */
    readonly pyramid: VirtualPyramid;

    constructor(values: VirtualImageValues) {
        const { width, height, pixels } = values;
        const ok = (n: number): boolean => Number.isInteger(n) && n >= 1 && n <= VT_MAX_SIDE;
        if (!ok(width) || !ok(height))
            throw new RangeError(
                `VirtualImage: tamanho ${width} × ${height} fora de 1–${VT_MAX_SIDE} por lado.`,
            );
        if (pixels.length !== width * height * 4)
            throw new RangeError(
                `VirtualImage: ${pixels.length} bytes para ${width} × ${height} × 4 (RGBA8).`,
            );
        this.width = width;
        this.height = height;
        this.wrap = values.wrap ?? 'repeat';
        this.colorSpace = values.colorSpace ?? 'srgb';
        this.levels = vtLevels(width, height);
        const { bases, total } = vtLevelBases(width, height);
        this.bases = bases;
        this.pages = total;
        this.pyramid = vtPyramid(width, height, pixels, this.colorSpace);
    }

    /** O nível e a posição (px, py) da página virtual `page` (relativa à imagem). */
    locate(page: number): { level: number; px: number; py: number } {
        let level = this.levels - 1;
        while (level > 0 && this.bases[level]! > page) level--;
        const [nx] = vtLevelPages(this.width, this.height, level);
        const k = page - this.bases[level]!;
        return { level, px: k % nx, py: Math.floor(k / nx) };
    }

    /** Os texels da página virtual `page` no atlas (128² RGBA8 na codificação da imagem, com a borda), escritos em `out`. */
    pageTexels(page: number, out?: Uint8Array): Uint8Array {
        const { level, px, py } = this.locate(page);
        return vtPageTexels(this.pyramid, level, px, py, this.wrap, out);
    }
}
