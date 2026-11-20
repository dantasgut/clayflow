// Referência f64 do mapa visto do sol por páginas (spec 041, R11 revisto, T029): o espelho do endereçamento do atlas
// (`cloud_shadow_pages.wgsl`, `cloud_shadow_lookup.wgsl`) e do esquema de invalidação (`cloud_shadow_select.wgsl`).
//
// O mapa é um mapa de recortes (clipmap) no plano perpendicular ao sol: `CLOUD_SHADOW_LEVELS` níveis, cada um com o
// dobro do texel do anterior e `CLOUD_SHADOW_PAGES²` páginas de `CLOUD_SHADOW_PAGE²` texels em volta da câmera, presas
// ao referencial das nuvens (a origem do plano anda com o vento: o conteúdo de uma página não muda com o vento
// uniforme). O endereço é toroidal (`g mod N`), como a tabela do mapa de sombra virtual da 034; todas as páginas da janela
// ficam residentes (os receptores da sombra — o chão, a névoa, a GI, a marcha — estão em toda parte), e a página que
// entra na janela é desenhada no mesmo quadro. Cada página física guarda 1 texel a mais do lado +x e +y (a coluna da
// vizinha): o filtro bilinear do hardware não cruza para a página física ao lado.
//
// A página vale enquanto a mudança prevista da transmitância e^(−τ) desde que foi desenhada fica abaixo da tolerância:
// o sol (o plano gira e a coluna inclina: o deslocamento lateral exato dos cantos da página e da coluna até a nuvem), o
// vento que sobra (o local menos o da camada), o comprimento do trecho da casca (os nós em frações dele) e a evolução
// da forma (a deriva do detalhe, o tempo). As medidas da página (os gradientes de T entre texels vizinhos e ao longo da
// coluna, o comprimento do trecho, a distância da nuvem ao plano) saem do desenho dela.
// Unidades: metros na cena, +y para cima.

import { type Vec3 } from './cloudModel';
import {
    CLOUD_SHADOW_LEVELS,
    CLOUD_SHADOW_PAGE,
    CLOUD_SHADOW_PAGES,
    CLOUD_SHADOW_PAGES_X,
    CLOUD_SHADOW_PROBES,
    CLOUD_SHADOW_SLOTS_X,
    CLOUD_SHADOW_STRIDE,
    CLOUD_SHADOW_TOLERANCE,
} from '../schemas';

export {
    CLOUD_SHADOW_ATLAS,
    CLOUD_SHADOW_LEVELS,
    CLOUD_SHADOW_PAGE,
    CLOUD_SHADOW_PAGES,
    CLOUD_SHADOW_PAGES_X,
    CLOUD_SHADOW_PIVOT,
    CLOUD_SHADOW_PROBES,
    CLOUD_SHADOW_SLOT_COUNT,
    CLOUD_SHADOW_SLOTS_X,
    CLOUD_SHADOW_STRIDE,
    CLOUD_SHADOW_TOLERANCE,
} from '../schemas';

/** Fator de segurança do gradiente medido entre texels vizinhos (o detalhe menor que o texel; medido no teste). */
export const CLOUD_SHADOW_GRADIENT_SAFETY = 2;
/** Quadros sem desenho em que a página ainda vale, no máximo (o teto da idade). */
export const CLOUD_SHADOW_MAX_AGE = 240;

/** Texel (m, em cima) do nível `k`; à direita, × a razão do sol (`shadowAspect`). */
export function shadowTexelSize(t0: number, k: number): number {
    return t0 * 2 ** k;
}

/** A menor razão do texel à direita pelo em cima (o sol rasante; `CLOUD_SHADOW_ASPECT_MIN`). */
export const CLOUD_SHADOW_ASPECT_MIN = 0.2;
/** A elevação do sol (°) a partir da qual o texel é quadrado: a razão contínua é `tan(el)/tan(19°)`. */
export const CLOUD_SHADOW_ASPECT_ELEVATION = 19;

/**
 * A razão `r` do texel à direita pelo em cima (espelho de `cloud_shadow_aspect`). Com o sol baixo a vizinha em cima é o
 * mesmo caminho deslocado ao longo de si, e a à direita é outro caminho de ~30 km pelo detalhe: a resolução que falta é
 * a à direita, na medida de `tan(el)/tan(19°)` (0,2 a 4°). Em degraus (1, ½, 0,2), nunca acima da contínua: a razão que
 * mudasse a cada quadro escalaria o texel em torno do pivô; no degrau, a janela inteira é refeita no mesmo quadro.
 */
export function shadowAspect(band: number, sun: Vec3): number {
    void band;
    const y = Math.min(1, Math.max(-1, sun[1]));
    const c =
        y
        / Math.max(Math.sqrt(Math.max(1 - y * y, 0)), 1e-6)
        / Math.tan((CLOUD_SHADOW_ASPECT_ELEVATION * Math.PI) / 180);
    if (c >= 1) return 1;
    if (c >= 0.5) return 0.5;
    return CLOUD_SHADOW_ASPECT_MIN;
}

/**
 * A página desenhada com o sol `drawn` vale com o sol `now`? (o degrau da razão no registro: a parte de
 * `cloud_shadow_meta_current` que vem do sol)
 */
export function shadowAspectCurrent(f: ShadowFrame, drawn: Vec3): boolean {
    return shadowAspect(f.band, drawn) === shadowAspect(f.band, f.sun);
}

/** Páginas da janela à direita com a razão `r` (espelho de `cloud_shadow_pages_x`): o raio útil em metros do em cima. */
export function shadowPagesX(r: number): number {
    const useful = (CLOUD_SHADOW_PAGES / 2 - 1) * CLOUD_SHADOW_PAGE - 2;
    const half = Math.ceil((useful / r + 2) / CLOUD_SHADOW_PAGE) + 1;
    return Math.min(2 * half, CLOUD_SHADOW_PAGES_X);
}

/** Raio útil (m, Chebyshev, o mesmo nos dois eixos) do nível `k` em volta da câmera: a janela menos a borda. */
export function shadowUsable(t0: number, k: number): number {
    return ((CLOUD_SHADOW_PAGES / 2 - 1) * CLOUD_SHADOW_PAGE - 2) * shadowTexelSize(t0, k);
}

/** O texel (m, à direita e em cima) do nível `k` no quadro `f`. */
function texelOf(f: ShadowFrame, k: number, sun = f.sun): [number, number] {
    const t = shadowTexelSize(f.texel, k);
    return [t * shadowAspect(f.band, sun), t];
}

/** As páginas da janela do quadro (à direita, em cima). */
export function shadowWindowPages(f: ShadowFrame): [number, number] {
    return [shadowPagesX(shadowAspect(f.band, f.sun)), CLOUD_SHADOW_PAGES];
}

const cross = (a: Vec3, b: Vec3): Vec3 => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
];
const dot = (a: readonly number[], b: readonly number[]): number =>
    a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;

/**
 * O referencial do plano do mapa para o sol `sun` (unitário): a rotação mínima que leva +y ao sol aplicada a +x (a
 * direita) e `sol × direita` (em cima). Contínuo em toda direção do sol menos a do nadir: o sol que anda gira o plano aos
 * poucos, sem a troca de eixo de `cross(y, sol)` perto do zênite.
 */
export function shadowBasis(sun: Vec3): { right: Vec3; up: Vec3 } {
    const c = sun[1];
    const k = 1 / (1 + c);
    const right: Vec3 = [c + sun[2] * sun[2] * k, -sun[0], -sun[0] * sun[2] * k];
    return { right, up: cross(sun, right) };
}

/** O referencial do quadro (o empacotamento do uniforme). */
export interface ShadowFrame {
    /** O pivô do plano (m, mundo): o vento × tempo mais a célula da grade do pivô. */
    readonly pivot: Vec3;
    readonly right: Vec3;
    readonly up: Vec3;
    readonly sun: Vec3;
    /** Texel do nível 0 (m). */
    readonly texel: number;
    /** A faixa da casca em frações do raio útil do último nível (a razão dos texels). */
    readonly band: number;
    /** A câmera no plano (m). */
    readonly camera: readonly [number, number];
}

/** Coordenadas (m) de `p` no plano do mapa. */
export function shadowPlane(f: ShadowFrame, p: Vec3): [number, number] {
    const rel = [p[0] - f.pivot[0], p[1] - f.pivot[1], p[2] - f.pivot[2]];
    return [dot(rel, f.right), dot(rel, f.up)];
}

/** Primeira página global da janela do nível `k`. */
export function shadowWindow(f: ShadowFrame, k: number): [number, number] {
    const t = texelOf(f, k);
    const n = shadowWindowPages(f);
    return [
        Math.floor(f.camera[0] / (CLOUD_SHADOW_PAGE * t[0])) - n[0] / 2,
        Math.floor(f.camera[1] / (CLOUD_SHADOW_PAGE * t[1])) - n[1] / 2,
    ];
}

const mod = (a: number, n: number): number => ((a % n) + n) % n;

/** As páginas físicas de um nível. */
const LEVEL_SLOTS = CLOUD_SHADOW_PAGES_X * CLOUD_SHADOW_PAGES;

/** A página física da página global `g` do nível `k` (endereço toroidal, 32 × 8 por nível). */
export function shadowSlot(k: number, g: readonly [number, number]): number {
    return (
        k * LEVEL_SLOTS
        + mod(g[1], CLOUD_SHADOW_PAGES) * CLOUD_SHADOW_PAGES_X
        + mod(g[0], CLOUD_SHADOW_PAGES_X)
    );
}

/** Texel do canto da página física `slot` no atlas. */
export function shadowSlotOrigin(slot: number): [number, number] {
    return [
        (slot % CLOUD_SHADOW_SLOTS_X) * CLOUD_SHADOW_STRIDE,
        Math.floor(slot / CLOUD_SHADOW_SLOTS_X) * CLOUD_SHADOW_STRIDE,
    ];
}

/**
 * A página global que a janela do quadro põe na página física `slot` e se ela está na janela (com o sol alto a janela tem
 * menos páginas à direita que as físicas).
 */
export function shadowSlotPage(
    f: ShadowFrame,
    slot: number,
): { level: number; page: [number, number]; active: boolean } {
    const k = Math.floor(slot / LEVEL_SLOTS);
    const r = slot % LEVEL_SLOTS;
    const s = [r % CLOUD_SHADOW_PAGES_X, Math.floor(r / CLOUD_SHADOW_PAGES_X)];
    const w = shadowWindow(f, k);
    const page: [number, number] = [
        w[0] + mod(s[0]! - w[0], CLOUD_SHADOW_PAGES_X),
        w[1] + mod(s[1]! - w[1], CLOUD_SHADOW_PAGES),
    ];
    return { level: k, page, active: page[0] - w[0] < shadowWindowPages(f)[0] };
}

/** O nível (o menor que cobre `x` com a borda) e o peso do seguinte na faixa de mistura (os 8 % de fora). */
export function shadowLevel(f: ShadowFrame, x: readonly [number, number]): [number, number] {
    const d = Math.max(Math.abs(x[0] - f.camera[0]), Math.abs(x[1] - f.camera[1]));
    const u0 = shadowUsable(f.texel, 0);
    const last = CLOUD_SHADOW_LEVELS - 1;
    const k = d <= u0 ? 0 : Math.min(Math.ceil(Math.log2(d / u0)), last);
    if (k >= last) return [last, 0];
    const r = d / shadowUsable(f.texel, k);
    const t = Math.min(1, Math.max(0, (r - 0.92) / 0.08));
    return [k, t * t * (3 - 2 * t)];
}

/**
 * Coordenadas (texels, contínuas) no atlas do ponto `x` do plano no nível `k`: o texel global preso à janela, a página
 * pela posição do par do filtro (os dois texels do filtro na mesma página física, o segundo podendo ser a coluna da
 * vizinha) e o canto da página física.
 */
export function shadowAtlasTexel(
    f: ShadowFrame,
    x: readonly [number, number],
    k: number,
): [number, number] {
    const t = texelOf(f, k);
    const w = shadowWindow(f, k);
    const P = CLOUD_SHADOW_PAGE;
    const N = shadowWindowPages(f);
    const out: number[] = [];
    const page: [number, number] = [0, 0];
    for (let a = 0; a < 2; a++) {
        const X = Math.min(Math.max(x[a]! / t[a]!, w[a]! * P + 0.5), (w[a]! + N[a]!) * P - 0.5);
        const g = Math.min(Math.max(Math.floor((X - 0.5) / P), w[a]!), w[a]! + N[a]! - 1);
        page[a] = g;
        out.push(X - g * P);
    }
    const o = shadowSlotOrigin(shadowSlot(k, page));
    return [o[0] + out[0]!, o[1] + out[1]!];
}

/**
 * O mapa lido de volta: `rgba16float` de `CLOUD_SHADOW_ATLAS²` × 4 camadas (4 nós por camada) e, opcional, o sol do
 * desenho de cada página física (3 por página; o registro da série).
 */
export interface ShadowAtlas {
    readonly width: number;
    readonly height: number;
    readonly depth: number;
    readonly data: Float32Array;
    readonly suns?: Float32Array;
}

/** O nó `n` (1…16; 0 é a entrada: τ 0) do atlas no texel contínuo `p`, bilinear. */
export function shadowAtlasKnot(map: ShadowAtlas, p: readonly [number, number], n: number): number {
    if (n <= 0) return 0;
    const j = Math.min(n, 16) - 1;
    const z = Math.floor(j / 4);
    const ch = j % 4;
    const fx = p[0] - 0.5;
    const fy = p[1] - 0.5;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const at = (i: number, k: number): number =>
        map.data[
            (z * map.height * map.width
                + Math.min(map.height - 1, Math.max(0, k)) * map.width
                + Math.min(map.width - 1, Math.max(0, i)))
                * 4
                + ch
        ]!;
    const ax = fx - x0;
    const ay = fy - y0;
    return (
        (at(x0, y0) * (1 - ax) + at(x0 + 1, y0) * ax) * (1 - ay)
        + (at(x0, y0 + 1) * (1 - ax) + at(x0 + 1, y0 + 1) * ax) * ay
    );
}

/** O sol do desenho da página física `slot` (o do quadro, sem o registro ou se ela ainda não foi desenhada). */
export function shadowPageSun(map: ShadowAtlas, f: ShadowFrame, slot: number): Vec3 {
    const s = map.suns;
    if (s === undefined) return f.sun;
    const v: Vec3 = [s[slot * 3]!, s[slot * 3 + 1]!, s[slot * 3 + 2]!];
    return v[0] * v[0] + v[1] * v[1] + v[2] * v[2] > 0.25 ? v : f.sun;
}

/**
 * O texel contínuo no atlas de `p` no nível `k` (espelho de `cloud_shadow_page_at` e `cloud_shadow_page_uv`): a página
 * escolhida pelo plano do quadro, o ponto lido pelo plano do sol do desenho dela.
 */
export function shadowPageTexel(
    map: ShadowAtlas,
    f: ShadowFrame,
    p: Vec3,
    k: number,
): { texel: [number, number]; sun: Vec3 } {
    const x = shadowPlane(f, p);
    const t = texelOf(f, k);
    const w = shadowWindow(f, k);
    const P = CLOUD_SHADOW_PAGE;
    const N = shadowWindowPages(f);
    const g = [0, 1].map((a) => {
        const X = Math.min(Math.max(x[a]! / t[a]!, w[a]! * P + 0.5), (w[a]! + N[a]!) * P - 0.5);
        return Math.min(Math.max(Math.floor((X - 0.5) / P), w[a]!), w[a]! + N[a]! - 1);
    }) as [number, number];
    const slot = shadowSlot(k, g);
    const sun = shadowPageSun(map, f, slot);
    const b = shadowBasis(sun);
    const xr = shadowPlane({ ...f, right: b.right, up: b.up }, p);
    const tr = texelOf(f, k, sun);
    const o = shadowSlotOrigin(slot);
    const texel = [0, 1].map((a) => {
        const lo = g[a]! * P;
        const X = Math.min(Math.max(xr[a]! / tr[a]!, lo + 0.5), lo + P + 0.5);
        return o[a]! + X - lo;
    }) as [number, number];
    return { texel, sun };
}

/** O nó `n` em `p` como a GPU o lê: os dois níveis misturados na faixa de transição, cada página pelo sol dela. */
export function shadowKnotAt(map: ShadowAtlas, f: ShadowFrame, p: Vec3, n: number): number {
    const [k, b] = shadowLevel(f, shadowPlane(f, p));
    const a = shadowAtlasKnot(map, shadowPageTexel(map, f, p, k).texel, n);
    if (b <= 0) return a;
    return a + (shadowAtlasKnot(map, shadowPageTexel(map, f, p, k + 1).texel, n) - a) * b;
}

/** O sol da página do primeiro nível da mistura em `p` (a posição ao longo da coluna é medida por ele). */
export function shadowColumnSun(map: ShadowAtlas, f: ShadowFrame, p: Vec3): Vec3 {
    const [k] = shadowLevel(f, shadowPlane(f, p));
    return shadowPageTexel(map, f, p, k).sun;
}

/** O referencial do quadro pelo uniforme empacotado (`CloudSchema`). */
export function shadowFrameOf(p: Record<string, readonly number[]>): ShadowFrame {
    const f = p.sunFrame!;
    const r = p.sunRight!;
    const u = p.sunUp!;
    const s = p.sunDir!;
    return {
        pivot: [f[0]!, f[1]!, f[2]!],
        right: [r[0]!, r[1]!, r[2]!],
        up: [u[0]!, u[1]!, u[2]!],
        sun: [s[0]!, s[1]!, s[2]!],
        texel: p.sunMap![0]!,
        band: f[3]!,
        camera: [r[3]!, u[3]!],
    };
}

// ---------------------------------------------------------------------------------------------------------------------
// Invalidação

/** O que a página guarda do desenho dela (`cloud_shadow_main`). */
export interface ShadowPageRecord {
    /** O sol com que foi desenhada. */
    readonly sun: Vec3;
    /** O tempo simulado do desenho (s). */
    readonly time: number;
    /** Maior |ΔT| entre texels vizinhos por metro (os nós 4, 8, 12 e 16, com a coluna da vizinha). */
    readonly gradient: number;
    /** Maior |ΔT| entre nós seguidos por metro ao longo da coluna. */
    readonly along: number;
    /** Maior comprimento do trecho da casca na página (m). */
    readonly length: number;
    /** Maior distância (m) das pontas do trecho ao plano do mapa. */
    readonly lever: number;
    /** O comprimento do trecho no centro da página (m). */
    readonly centerLength: number;
}

/** O estado do quadro que a previsão compara com o do desenho. */
export interface ShadowPageNow {
    readonly sun: Vec3;
    readonly time: number;
    /** O comprimento do trecho no centro da página com o sol de agora (m). */
    readonly centerLength: number;
    /** A velocidade das nuvens em relação ao referencial do mapa (m/s): o vento local menos o da camada. */
    readonly residualWind: number;
    /** Tempo (s) em que a evolução da forma muda a transmitância de 1/e: e^(−τ)·τ ≤ 1/e por unidade de τ. */
    readonly evolution: number;
}

/** O deslocamento (m) de um ponto `x` do plano entre as bases de dois sóis. */
function basisShift(a: Vec3, b: Vec3, x: readonly [number, number]): number {
    const A = shadowBasis(a);
    const B = shadowBasis(b);
    const d = [0, 1, 2].map(
        (i) => (A.right[i]! - B.right[i]!) * x[0] + (A.up[i]! - B.up[i]!) * x[1],
    );
    return Math.hypot(d[0]!, d[1]!, d[2]!);
}

/**
 * A mudança prevista da transmitância de um texel da página (espelho de `cloud_shadow_error`): o deslocamento lateral
 * das linhas do mapa (o plano girando nos cantos da página e a coluna inclinando até a nuvem mais longe do plano, mais o
 * vento que sobra) × o gradiente medido com o fator de segurança, o deslocamento dos nós (o trecho mudando de
 * comprimento) × o gradiente ao longo da coluna e a evolução da forma.
 */
export function shadowPageError(
    rec: ShadowPageRecord,
    now: ShadowPageNow,
    corners: readonly (readonly [number, number])[],
): number {
    const dt = Math.max(now.time - rec.time, 0);
    let frame = 0;
    for (const c of corners) frame = Math.max(frame, basisShift(rec.sun, now.sun, c));
    const tilt = Math.hypot(
        rec.sun[0] - now.sun[0],
        rec.sun[1] - now.sun[1],
        rec.sun[2] - now.sun[2],
    );
    const lateral = frame + tilt * rec.lever + now.residualWind * dt;
    const knots =
        rec.centerLength > 0 ? rec.length * Math.abs(now.centerLength / rec.centerLength - 1) : 0;
    const evolution = now.evolution > 0 ? (dt / now.evolution) * Math.exp(-1) : 0;
    return CLOUD_SHADOW_GRADIENT_SAFETY * rec.gradient * lateral + rec.along * knots + evolution;
}

/** Os cantos (m, no plano) da página global `g` do nível `k`, com a coluna da vizinha (`aspect`: a razão à direita). */
export function shadowPageCorners(
    t0: number,
    k: number,
    g: readonly [number, number],
    aspect = 1,
): [number, number][] {
    const t = shadowTexelSize(t0, k);
    const P = CLOUD_SHADOW_PAGE;
    const x0 = g[0] * P * t * aspect;
    const y0 = g[1] * P * t;
    const x1 = x0 + (P + 1) * t * aspect;
    const y1 = y0 + (P + 1) * t;
    return [
        [x0, y0],
        [x1, y0],
        [x0, y1],
        [x1, y1],
    ];
}

/**
 * As medidas de uma página pelos texels desenhados (`τ` dos 16 nós por texel, `CLOUD_SHADOW_STRIDE²` texels em ordem de
 * linha), o comprimento do trecho e a distância das pontas ao plano por texel: o espelho da redução do desenho.
 */
export function shadowPageStats(
    taus: readonly (readonly number[])[],
    lengths: readonly number[],
    levers: readonly number[],
    texel: number,
): { gradient: number; along: number; length: number; lever: number } {
    const S = CLOUD_SHADOW_STRIDE;
    let gradient = 0;
    let along = 0;
    for (let j = 0; j < S; j++)
        for (let i = 0; i < S; i++) {
            const a = taus[j * S + i]!;
            for (const n of [3, 7, 11, 15]) {
                const ta = Math.exp(-a[n]!);
                if (i + 1 < S)
                    gradient = Math.max(
                        gradient,
                        Math.abs(ta - Math.exp(-taus[j * S + i + 1]![n]!)),
                    );
                if (j + 1 < S)
                    gradient = Math.max(
                        gradient,
                        Math.abs(ta - Math.exp(-taus[(j + 1) * S + i]![n]!)),
                    );
            }
            const L = lengths[j * S + i]!;
            if (L > 0) {
                let prev = 1;
                for (let n = 0; n < 16; n++) {
                    const tn = Math.exp(-a[n]!);
                    along = Math.max(along, (prev - tn) / (L / 16));
                    prev = tn;
                }
            }
        }
    return {
        gradient: gradient / texel,
        along,
        length: Math.max(0, ...lengths),
        lever: Math.max(0, ...levers),
    };
}

/** Quadros entre as provas de uma página, em rodízio pela página física (`CLOUD_SHADOW_PROBE_PERIOD`). */
export const CLOUD_SHADOW_PROBE_PERIOD = 8;

/** A página física `slot` prova no quadro `frame`? (espelho de `cloud_shadow_probes_now`) */
export function shadowProbesNow(slot: number, frame: number): boolean {
    return (slot + frame) % CLOUD_SHADOW_PROBE_PERIOD === 0;
}

/** Hash inteiro (o de `cloud_shadow_hash`, de 32 bits). */
function hash32(x0: number): number {
    let x = x0 >>> 0;
    x ^= x >>> 16;
    x = Math.imul(x, 0x7feb352d) >>> 0;
    x ^= x >>> 15;
    x = Math.imul(x, 0x846ca68b) >>> 0;
    x ^= x >>> 16;
    return x >>> 0;
}

/**
 * O texel (0…`CLOUD_SHADOW_STRIDE²` − 1, em ordem de linha) da prova `j` da página física `slot` no quadro `frame`: um
 * embaralhamento por quadro, para que em poucos quadros as provas passem por toda a página.
 */
export function shadowProbeTexel(slot: number, frame: number, j: number): number {
    const S = CLOUD_SHADOW_STRIDE * CLOUD_SHADOW_STRIDE;
    return (
        hash32(
            ((slot * CLOUD_SHADOW_PROBES + j) * 0x9e3779b1 + Math.imul(frame >>> 0, 0x85ebca6b))
                >>> 0,
        ) % S
    );
}

/**
 * A prioridade de uma página inválida (`cloud_shadow_select_main`): a mudança prevista em tolerâncias × os quadros
 * desde o desenho (a página que espera sobe na fila: nenhuma fica para sempre fora do orçamento), × √2 por nível mais
 * fino (perto da câmera primeiro) e × 4 vista pela câmera. Na fila, em oitavas (`floor(log2)`), da maior à menor.
 */
export function shadowPagePriority(
    error: number,
    level: number,
    visible: boolean,
    age: number,
): number {
    return (
        (error / CLOUD_SHADOW_TOLERANCE)
        * Math.max(age, 1)
        * 2 ** ((CLOUD_SHADOW_LEVELS - 1 - level) / 2)
        * (visible ? 4 : 1)
    );
}
