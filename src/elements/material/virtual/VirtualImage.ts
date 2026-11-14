import {
    VT_MAX_SIDE,
    vtLevelCount,
    vtPagesOfLevel,
    type VirtualColorSpace,
    type VirtualWrap,
} from './layout';

/** Valores de uma `VirtualImage`. */
export interface VirtualImageValues {
    /** Largura em pixels (até 32 768). */
    readonly width: number;
    /** Altura em pixels (até 32 768). */
    readonly height: number;
    /** Fora de [0, 1]: repetir (padrão) ou prender na borda. */
    readonly wrap?: VirtualWrap;
    /**
     * Cor em sRGB (padrão: decodificada para luz linear antes da filtragem) ou dado linear (rugosidade, metal, normais,
     * máscaras: filtrado como está).
     */
    readonly colorSpace?: VirtualColorSpace;
}

/**
 * Imagem de material lida por páginas (spec 034, T060c — texturas virtuais): só o tamanho, o endereçamento e a
 * codificação. Os texels não passam pelo motor fora da GPU: a fonte (a aplicação — o arquivo, a rede ou a memória dela)
 * responde aos pedidos `virtualTextureRequest` do `VirtualTextureFlow` com a cópia dos bytes pedidos
 * (`virtualTextureDelivery`). Na entrada, a GPU prepara a pirâmide (os níveis reduzidos pela média 2 × 2 em luz linear,
 * por blocos) e a entrega à fonte (`virtualTextureLevel`); depois, só as páginas que os quadros pedem vão ao atlas das
 * `VirtualTextures` da cena — a imagem pode ser maior que a memória de GPU reservada a ela. Entra na cena por
 * `VirtualTextures` (`images` ou `addImage`: o índice que o nó `nodes.image.virtual` recebe); não é uma entidade.
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

    constructor(values: VirtualImageValues) {
        const { width, height } = values;
        const ok = (n: number): boolean => Number.isInteger(n) && n >= 1 && n <= VT_MAX_SIDE;
        if (!ok(width) || !ok(height))
            throw new RangeError(
                `VirtualImage: tamanho ${width} × ${height} fora de 1–${VT_MAX_SIDE} por lado.`,
            );
        this.width = width;
        this.height = height;
        this.wrap = values.wrap ?? 'repeat';
        this.colorSpace = values.colorSpace ?? 'srgb';
        this.levels = vtLevelCount(width, height);
        const bases: number[] = [];
        let total = 0;
        for (let l = 0; l < this.levels; l++) {
            bases.push(total);
            const [px, py] = vtPagesOfLevel(width, height, l);
            total += px * py;
        }
        this.bases = bases;
        this.pages = total;
    }

    /** O nível e a posição (px, py) da página virtual `page` (relativa à imagem). */
    locate(page: number): { level: number; px: number; py: number } {
        let level = this.levels - 1;
        while (level > 0 && this.bases[level]! > page) level--;
        const [nx] = vtPagesOfLevel(this.width, this.height, level);
        const k = page - this.bases[level]!;
        return { level, px: k % nx, py: Math.floor(k / nx) };
    }
}
