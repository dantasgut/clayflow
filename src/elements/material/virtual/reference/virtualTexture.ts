// Referência f64 das texturas virtuais dos materiais (spec 034, T060c), na mesma representação da GPU: a pirâmide de
// níveis em 8 bits (sRGB ou linear; o que o atlas `rgba8unorm` guarda), as páginas de 120² texels com borda de 4 (128² no
// atlas), a disposição das páginas virtuais de uma imagem (nível a nível, linha a linha), o nível pelas derivadas do uv,
// a leitura direta (bilinear em luz linear em cada nível e a mistura linear entre dois níveis — o que a GPU faz com as
// páginas residentes) e a ordem da alocação (do nível mais grosso ao mais fino, pelo índice, até o orçamento e as livres).
// O kernel e o nó (`vt_pages.wgsl`, `nodes/image.wgsl`) seguem estas regras; os testes em `__tests__`.

import { srgbDecode, srgbEncode } from '../../../math/reference/color';

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

/** Endereçamento fora de [0, 1]: repetir (o padrão dos materiais) ou prender na borda. */
export type VirtualWrap = 'repeat' | 'clamp';

/** Codificação dos valores: cor em sRGB (decodificada para luz linear) ou dado linear (rugosidade, normais, máscaras). */
export type VirtualColorSpace = 'srgb' | 'linear';

/** Número de níveis da pirâmide de uma imagem `width × height` (até 1 × 1). */
export function vtLevels(width: number, height: number): number {
    return Math.floor(Math.log2(Math.max(width, height))) + 1;
}

/** Lado do nível `level` (o anterior dividido por dois, no mínimo 1). */
export function vtLevelSize(width: number, height: number, level: number): [number, number] {
    return [Math.max(1, width >> level), Math.max(1, height >> level)];
}

/** Páginas por eixo do nível `level`. */
export function vtLevelPages(width: number, height: number, level: number): [number, number] {
    const [w, h] = vtLevelSize(width, height, level);
    return [Math.ceil(w / VT_PAGE_PAYLOAD), Math.ceil(h / VT_PAGE_PAYLOAD)];
}

/** A primeira página virtual de cada nível (relativa à imagem) e o total de páginas. */
export function vtLevelBases(width: number, height: number): { bases: number[]; total: number } {
    const bases: number[] = [];
    let total = 0;
    for (let l = 0; l < vtLevels(width, height); l++) {
        bases.push(total);
        const [px, py] = vtLevelPages(width, height, l);
        total += px * py;
    }
    return { bases, total };
}

/** Os níveis da pirâmide, cada um RGBA8 na codificação da imagem (linhas de cima para baixo). */
export interface VirtualPyramid {
    readonly width: number;
    readonly height: number;
    readonly colorSpace: VirtualColorSpace;
    readonly levels: readonly Uint8Array[];
}

/** Tabelas da decodificação dos 256 valores de 8 bits: sRGB e linear. */
const DECODE = Float64Array.from({ length: 256 }, (_, i) => srgbDecode(i / 255));
const LINEAR = Float64Array.from({ length: 256 }, (_, i) => i / 255);

/** Valor de 8 bits de `x` em [0, 1] (arredondado). */
const byte = (x: number): number => Math.min(255, Math.max(0, Math.round(x * 255)));

/**
 * A pirâmide de `pixels` (RGBA8, `width × height`): cada nível pela média 2 × 2 do anterior em luz linear (o canal alfa,
 * e todos os canais da imagem linear, sem curva), recodificado em 8 bits; no lado ímpar, o último texel entra no par da
 * borda.
 */
export function vtPyramid(
    width: number,
    height: number,
    pixels: Uint8Array,
    colorSpace: VirtualColorSpace = 'srgb',
): VirtualPyramid {
    const srgb = colorSpace === 'srgb';
    const levels: Uint8Array[] = [pixels];
    for (let l = 1; l < vtLevels(width, height); l++) {
        const [pw, ph] = vtLevelSize(width, height, l - 1);
        const [w, h] = vtLevelSize(width, height, l);
        const src = levels[l - 1]!;
        const out = new Uint8Array(w * h * 4);
        for (let y = 0; y < h; y++) {
            const y0 = Math.min(2 * y, ph - 1);
            const y1 = Math.min(2 * y + 1, ph - 1);
            for (let x = 0; x < w; x++) {
                const x0 = Math.min(2 * x, pw - 1);
                const x1 = Math.min(2 * x + 1, pw - 1);
                const o = (y * w + x) * 4;
                for (let c = 0; c < 4; c++) {
                    const at = (xx: number, yy: number): number => src[(yy * pw + xx) * 4 + c]!;
                    if (c === 3 || !srgb) {
                        out[o + c] = Math.round(
                            (at(x0, y0) + at(x1, y0) + at(x0, y1) + at(x1, y1)) / 4,
                        );
                    } else {
                        const m =
                            (DECODE[at(x0, y0)]!
                                + DECODE[at(x1, y0)]!
                                + DECODE[at(x0, y1)]!
                                + DECODE[at(x1, y1)]!)
                            / 4;
                        out[o + c] = byte(srgbEncode(m));
                    }
                }
            }
        }
        levels.push(out);
    }
    return { width, height, colorSpace, levels };
}

/** Índice do texel `i` num eixo de `n` texels pelo endereçamento. */
function wrapIndex(i: number, n: number, wrap: VirtualWrap): number {
    return wrap === 'repeat' ? ((i % n) + n) % n : Math.min(Math.max(i, 0), n - 1);
}

/**
 * Os texels de uma página no atlas (`VT_PAGE_STRIDE²` RGBA8, linhas de 512 bytes): o conteúdo do nível `level` a partir
 * do texel (`px·120`, `py·120`) e a borda dos vizinhos pelo endereçamento (repetida na volta, presa na borda).
 */
export function vtPageTexels(
    pyramid: VirtualPyramid,
    level: number,
    px: number,
    py: number,
    wrap: VirtualWrap,
    target?: Uint8Array,
): Uint8Array {
    const out = target ?? new Uint8Array(VT_PAGE_STRIDE * VT_PAGE_STRIDE * 4);
    const [w, h] = vtLevelSize(pyramid.width, pyramid.height, level);
    const src = pyramid.levels[level]!;
    const x0 = px * VT_PAGE_PAYLOAD - VT_PAGE_BORDER;
    const y0 = py * VT_PAGE_PAYLOAD - VT_PAGE_BORDER;
    for (let j = 0; j < VT_PAGE_STRIDE; j++) {
        const sy = wrapIndex(y0 + j, h, wrap);
        for (let i = 0; i < VT_PAGE_STRIDE; i++) {
            const s = (sy * w + wrapIndex(x0 + i, w, wrap)) * 4;
            const d = (j * VT_PAGE_STRIDE + i) * 4;
            out[d] = src[s]!;
            out[d + 1] = src[s + 1]!;
            out[d + 2] = src[s + 2]!;
            out[d + 3] = src[s + 3]!;
        }
    }
    return out;
}

/** O uv dentro de [0, 1] pelo endereçamento (repetir: a parte fracionária; prender: o corte). */
export function vtWrapUv(u: number, wrap: VirtualWrap): number {
    return wrap === 'repeat' ? u - Math.floor(u) : Math.min(Math.max(u, 0), 1);
}

/**
 * O nível contínuo pelas derivadas do uv na tela (a maior pegada do pixel em texels do nível 0, como a amostragem com
 * mip do hardware), preso em [0, níveis − 1].
 */
export function vtLod(
    width: number,
    height: number,
    duvdx: readonly [number, number],
    duvdy: readonly [number, number],
): number {
    const rho = Math.max(
        Math.hypot(duvdx[0] * width, duvdx[1] * height),
        Math.hypot(duvdy[0] * width, duvdy[1] * height),
    );
    const lod = Math.log2(Math.max(rho, 1e-8));
    return Math.min(Math.max(lod, 0), vtLevels(width, height) - 1);
}

/** A página virtual (relativa à imagem) que contém o uv (já no intervalo) no nível `level`. */
export function vtPageOf(
    width: number,
    height: number,
    level: number,
    u: number,
    v: number,
): number {
    const [w, h] = vtLevelSize(width, height, level);
    const [nx, ny] = vtLevelPages(width, height, level);
    const px = Math.min(Math.floor((u * w) / VT_PAGE_PAYLOAD), nx - 1);
    const py = Math.min(Math.floor((v * h) / VT_PAGE_PAYLOAD), ny - 1);
    return vtLevelBases(width, height).bases[level]! + py * nx + px;
}

/** RGBA em luz linear (alfa linear; a imagem linear sem curva) do texel (`x`, `y`) do nível, pelo endereçamento. */
function texel(
    pyramid: VirtualPyramid,
    level: number,
    x: number,
    y: number,
    wrap: VirtualWrap,
): [number, number, number, number] {
    const [w, h] = vtLevelSize(pyramid.width, pyramid.height, level);
    const s = (wrapIndex(y, h, wrap) * w + wrapIndex(x, w, wrap)) * 4;
    const p = pyramid.levels[level]!;
    const d = pyramid.colorSpace === 'srgb' ? DECODE : LINEAR;
    return [d[p[s]!]!, d[p[s + 1]!]!, d[p[s + 2]!]!, p[s + 3]! / 255];
}

/** Leitura direta bilinear (em luz linear) do nível `level` no uv já no intervalo — centros dos texels em (i + ½). */
export function vtSampleLevel(
    pyramid: VirtualPyramid,
    level: number,
    u: number,
    v: number,
    wrap: VirtualWrap,
): [number, number, number, number] {
    const [w, h] = vtLevelSize(pyramid.width, pyramid.height, level);
    const x = u * w - 0.5;
    const y = v * h - 0.5;
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    const a = texel(pyramid, level, x0, y0, wrap);
    const b = texel(pyramid, level, x0 + 1, y0, wrap);
    const c = texel(pyramid, level, x0, y0 + 1, wrap);
    const d = texel(pyramid, level, x0 + 1, y0 + 1, wrap);
    return [0, 1, 2, 3].map(
        (k) => (a[k]! * (1 - fx) + b[k]! * fx) * (1 - fy) + (c[k]! * (1 - fx) + d[k]! * fx) * fy,
    ) as [number, number, number, number];
}

/**
 * A leitura direta da imagem no uv com as derivadas: o nível contínuo, o bilinear nos dois níveis em volta e a mistura
 * linear — o que a GPU devolve com todas as páginas residentes.
 */
export function vtSample(
    pyramid: VirtualPyramid,
    uv: readonly [number, number],
    duvdx: readonly [number, number],
    duvdy: readonly [number, number],
    wrap: VirtualWrap,
): [number, number, number, number] {
    const { width, height } = pyramid;
    const lod = vtLod(width, height, duvdx, duvdy);
    const l0 = Math.floor(lod);
    const t = lod - l0;
    const u = vtWrapUv(uv[0], wrap);
    const v = vtWrapUv(uv[1], wrap);
    const c0 = vtSampleLevel(pyramid, l0, u, v, wrap);
    if (t <= 0 || l0 + 1 >= vtLevels(width, height)) return c0;
    const c1 = vtSampleLevel(pyramid, l0 + 1, u, v, wrap);
    return c0.map((x, k) => x + (c1[k]! - x) * t) as [number, number, number, number];
}

/** Média da imagem (o nível de 1 × 1, na codificação dela): a cor sem página residente. */
export function vtAverage(pyramid: VirtualPyramid): [number, number, number, number] {
    const last = pyramid.levels[pyramid.levels.length - 1]!;
    return [last[0]!, last[1]!, last[2]!, last[3]!];
}

/**
 * A ordem da alocação de um quadro: as páginas pedidas sem página física (`needs`, índices globais com o nível de cada
 * uma), do nível mais grosso ao mais fino e, no nível, pelo índice; até o orçamento e até as físicas livres (`free`, em
 * ordem). Devolve os pares (página virtual, página física) — a lista que a CPU lê de volta e carrega.
 */
export function vtAllocate(
    needs: readonly { readonly page: number; readonly level: number }[],
    free: readonly number[],
    budget: number,
): [number, number][] {
    const ordered = [...needs].sort((a, b) => b.level - a.level || a.page - b.page);
    const count = Math.min(ordered.length, free.length, budget);
    return ordered.slice(0, count).map((n, k) => [n.page, free[k]!]);
}
