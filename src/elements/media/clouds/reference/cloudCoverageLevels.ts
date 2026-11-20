// Referência f64 do mapa de cobertura em níveis em volta da câmera (spec 041, R21 rodada 19, T077): o espelho do
// endereçamento do volume (`cloud_coverage_pages.wgsl`), do desenho das páginas (`cloud_coverage_draw.wgsl`) e da leitura
// (`cloud_coverage_at` em `cloud_density.wgsl`).
//
// O mapa é um mapa de recortes (clipmap) no plano horizontal do referencial do vento: `levels` níveis, cada um com o dobro
// do texel do anterior e `CLOUD_COVERAGE_PAGES²` páginas de `CLOUD_COVERAGE_PAGE²` texels em volta da câmera (a janela
// presa à página), endereço toroidal: o nível `k` é a camada `k` de um volume de 512² texels, o texel global `i` no texel
// `i mod 512`, lido com o endereço que se repete (o par bilinear do outro lado da costura é o vizinho no toro). A leitura usa
// o nível mais fino cuja janela cobre o ponto (Chebyshev, até `COVERAGE_REACH` texels do centro dela);
// fora do último nível, o valor no ponto (os campos da camada). A passagem de um nível ao seguinte fica no desenho: o anel de
// fora de cada janela guarda o valor levado ao do nível seguinte, e a leitura é uma só.
// Unidades: metros no referencial do vento (o ponto da cena menos o vento × tempo).

import { CLOUD_COVERAGE_PAGE, CLOUD_COVERAGE_PAGES, CLOUD_COVERAGE_SIDE } from '../schemas';

export {
    CLOUD_COVERAGE_PAGE,
    CLOUD_COVERAGE_PAGES,
    CLOUD_COVERAGE_SIDE,
    cloudCoverageLevels,
    cloudCoverageSlotCount,
} from '../schemas';

/** O mapa num quadro: o texel do nível 0 (m), quantos níveis e a câmera no referencial do vento (m). */
export interface CoverageLevels {
    readonly texel: number;
    readonly levels: number;
    readonly eye: readonly [number, number];
}

/** Texel (m) do nível `k`. */
export function coverageTexelSize(m: CoverageLevels, k: number): number {
    return m.texel * 2 ** k;
}

/** Alcance (texels, Chebyshev) do nível em volta do centro da janela dele (`CLOUD_COVERAGE_REACH`). */
export const COVERAGE_REACH = 255;
/** Largura (texels) do anel de fora que leva o valor ao do nível seguinte (`CLOUD_COVERAGE_BAND`). */
export const COVERAGE_BAND = 15;

/** Raio útil (m, Chebyshev) do nível `k` em volta da câmera, com qualquer janela (o centro dela a menos de uma página). */
export function coverageUsable(m: CoverageLevels, k: number): number {
    return (COVERAGE_REACH - CLOUD_COVERAGE_PAGE) * coverageTexelSize(m, k);
}

/** A página da câmera no nível `k`: a do nível 0 deslocada `k` bits (espelho de `cloud_coverage_camera_page`). */
export function coverageCameraPage(m: CoverageLevels, k: number): [number, number] {
    const s = CLOUD_COVERAGE_PAGE * m.texel;
    return [Math.floor(m.eye[0] / s) >> k, Math.floor(m.eye[1] / s) >> k];
}

/** Primeira página global da janela do nível `k`. */
export function coverageWindow(m: CoverageLevels, k: number): [number, number] {
    const g = coverageCameraPage(m, k);
    return [g[0] - CLOUD_COVERAGE_PAGES / 2, g[1] - CLOUD_COVERAGE_PAGES / 2];
}

const mod = (a: number, n: number): number => ((a % n) + n) % n;

/** A página física da página global `g` do nível `k`. */
export function coverageSlot(k: number, g: readonly [number, number]): number {
    const n = CLOUD_COVERAGE_PAGES;
    return k * n * n + mod(g[1], n) * n + mod(g[0], n);
}

/** A página global que a janela do quadro põe na página física `slot` (e o nível dela). */
export function coverageSlotPage(
    m: CoverageLevels,
    slot: number,
): { k: number; g: [number, number] } {
    const n = CLOUD_COVERAGE_PAGES;
    const k = Math.floor(slot / (n * n));
    const r = slot % (n * n);
    const s = [r % n, Math.floor(r / n)];
    const w = coverageWindow(m, k);
    return { k, g: [w[0] + mod(s[0]! - w[0], n), w[1] + mod(s[1]! - w[1], n)] };
}

/** O centro (texels globais) da janela do nível `k`. */
export function coverageCenter(m: CoverageLevels, k: number): [number, number] {
    const w = coverageWindow(m, k);
    const h = (CLOUD_COVERAGE_PAGES / 2) * CLOUD_COVERAGE_PAGE;
    return [w[0] * CLOUD_COVERAGE_PAGE + h, w[1] * CLOUD_COVERAGE_PAGE + h];
}

/** A distância (texels, Chebyshev) de `w` ao centro da janela do nível `k`. */
export function coverageReach(m: CoverageLevels, w: readonly [number, number], k: number): number {
    const t = coverageTexelSize(m, k);
    const c = coverageCenter(m, k);
    return Math.max(Math.abs(w[0] / t - c[0]), Math.abs(w[1] / t - c[1]));
}

/** O nível que lê `w` (espelho de `cloud_coverage_level`); `levels` fora do mapa. */
export function coverageLevel(m: CoverageLevels, w: readonly [number, number]): number {
    const q = Math.max(Math.abs(w[0] - m.eye[0]), Math.abs(w[1] - m.eye[1])) / coverageUsable(m, 0);
    const k = q > 1 ? Math.ceil(Math.log2(q)) : 0;
    if (k > m.levels) return m.levels;
    if (k > 0 && coverageReach(m, w, k - 1) <= COVERAGE_REACH) return k - 1;
    return k;
}

const smoothstep = (a: number, b: number, x: number): number => {
    const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
    return t * t * (3 - 2 * t);
};

/** O peso do nível seguinte no texel do ponto `p` do nível `k` (espelho de `cloud_coverage_ring`). */
export function coverageRing(m: CoverageLevels, p: readonly [number, number], k: number): number {
    if (k + 1 >= m.levels) return 0;
    return smoothstep(COVERAGE_REACH - COVERAGE_BAND, COVERAGE_REACH, coverageReach(m, p, k));
}

/** A coordenada contínua (em texels globais do nível `k`) de `w` (o raio útil deixa o par bilinear dentro da janela). */
function globalTexel(m: CoverageLevels, w: readonly [number, number], k: number): [number, number] {
    const t = coverageTexelSize(m, k);
    return [w[0] / t, w[1] / t];
}

/** O texel do volume (x, y, camada) do texel global `(i, j)` do nível `k` (espelho de `cloud_coverage_store_texel`). */
export function coverageStoreTexel(k: number, i: number, j: number): [number, number, number] {
    return [mod(i, CLOUD_COVERAGE_SIDE), mod(j, CLOUD_COVERAGE_SIDE), k];
}

/** A coordenada de amostra (o endereço que se repete) de `w` no nível `k` (espelho de `cloud_coverage_uvw`, sem a camada). */
export function coverageUv(
    m: CoverageLevels,
    w: readonly [number, number],
    k: number,
): [number, number] {
    const s = CLOUD_COVERAGE_SIDE * coverageTexelSize(m, k);
    return [w[0] / s, w[1] / s];
}

/** O centro (m, referencial do vento) do texel global `(i, j)` do nível `k`. */
export function coverageTexelCenter(
    m: CoverageLevels,
    k: number,
    i: number,
    j: number,
): [number, number] {
    const t = coverageTexelSize(m, k);
    return [(i + 0.5) * t, (j + 0.5) * t];
}

/** O valor (canais) do texel global `(i, j)` do nível `k`. */
export type CoverageTexel = (k: number, i: number, j: number) => readonly number[];

/**
 * O texel desenhado (espelho de `cloud_coverage_texel_value`): o valor `raw` no centro dele e, no anel de fora da janela,
 * levado à bilinear dos valores `raw` nos centros do nível seguinte.
 */
export function coverageRingTexel(m: CoverageLevels, raw: CoverageTexel): CoverageTexel {
    return (k, i, j) => {
        const p = coverageTexelCenter(m, k, i, j);
        const v = raw(k, i, j);
        const b = coverageRing(m, p, k);
        if (b <= 0) return v;
        const coarse = coverageSampleLevel(m, p, k + 1, raw);
        return v.map((y, n) => y + (coarse[n]! - y) * b);
    };
}

/** A bilinear dos texels globais do nível `k` em `w` (o que o hardware lê no volume com o endereço que se repete). */
export function coverageSampleLevel(
    m: CoverageLevels,
    w: readonly [number, number],
    k: number,
    texel: CoverageTexel,
): number[] {
    const X = globalTexel(m, w, k);
    const fx = X[0] - 0.5;
    const fz = X[1] - 0.5;
    const i = Math.floor(fx);
    const j = Math.floor(fz);
    const ax = fx - i;
    const az = fz - j;
    const a = texel(k, i, j);
    const b = texel(k, i + 1, j);
    const c = texel(k, i, j + 1);
    const d = texel(k, i + 1, j + 1);
    return a.map(
        (_, n) => (a[n]! * (1 - ax) + b[n]! * ax) * (1 - az) + (c[n]! * (1 - ax) + d[n]! * ax) * az,
    );
}

/**
 * A cobertura lida em `w` (espelho de `cloud_coverage_at`): uma leitura no nível que cobre o ponto (`texel` já com o anel:
 * `coverageRingTexel`); fora do mapa, `outside(w)`.
 */
export function coverageSample(
    m: CoverageLevels,
    w: readonly [number, number],
    texel: CoverageTexel,
    outside: (w: readonly [number, number]) => readonly number[],
): number[] {
    const k = coverageLevel(m, w);
    if (k >= m.levels) return [...outside(w)];
    return coverageSampleLevel(m, w, k, texel);
}

/**
 * O volume desenhado (espelho de `cloud_coverage_draw`): cada página física da janela com os 16² texels da página global
 * dela no endereço toroidal, `channels` canais por texel.
 */
export function coverageDrawVolume(
    m: CoverageLevels,
    channels: number,
    value: (k: number, i: number, j: number) => readonly number[],
): Float64Array {
    const S = CLOUD_COVERAGE_SIDE;
    const data = new Float64Array(S * S * m.levels * channels);
    const slots = m.levels * CLOUD_COVERAGE_PAGES * CLOUD_COVERAGE_PAGES;
    for (let slot = 0; slot < slots; slot++) {
        const { k, g } = coverageSlotPage(m, slot);
        for (let ty = 0; ty < CLOUD_COVERAGE_PAGE; ty++)
            for (let tx = 0; tx < CLOUD_COVERAGE_PAGE; tx++) {
                const i = g[0] * CLOUD_COVERAGE_PAGE + tx;
                const j = g[1] * CLOUD_COVERAGE_PAGE + ty;
                const v = value(k, i, j);
                const [x, y] = coverageStoreTexel(k, i, j);
                const at = ((k * S + y) * S + x) * channels;
                for (let n = 0; n < channels; n++) data[at + n] = v[n]!;
            }
    }
    return data;
}

/** O texel global `(i, j)` do nível `k` lido no volume (a leitura da GPU: `channels` canais por texel). */
export function coverageVolumeReader(data: ArrayLike<number>, channels: number): CoverageTexel {
    const S = CLOUD_COVERAGE_SIDE;
    return (k, i, j) => {
        const [x, y] = coverageStoreTexel(k, i, j);
        const at = ((k * S + y) * S + x) * channels;
        return Array.from({ length: channels }, (_, n) => data[at + n]!);
    };
}

/** A bilinear da camada `k` do volume em `(u, v)` com o endereço que se repete (o filtro do hardware). */
export function volumeBilinearRepeat(
    data: ArrayLike<number>,
    channels: number,
    k: number,
    u: number,
    v: number,
): number[] {
    const S = CLOUD_COVERAGE_SIDE;
    const fx = u * S - 0.5;
    const fy = v * S - 0.5;
    const i = Math.floor(fx);
    const j = Math.floor(fy);
    const ax = fx - i;
    const ay = fy - j;
    const at = (a: number, b: number, n: number): number =>
        data[((k * S + mod(b, S)) * S + mod(a, S)) * channels + n]!;
    return Array.from(
        { length: channels },
        (_, n) =>
            (at(i, j, n) * (1 - ax) + at(i + 1, j, n) * ax) * (1 - ay)
            + (at(i, j + 1, n) * (1 - ax) + at(i + 1, j + 1, n) * ax) * ay,
    );
}
