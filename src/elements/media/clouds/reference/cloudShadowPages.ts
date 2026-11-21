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
    CLOUD_SHADOW_HIDDEN_TOLERANCE,
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

/** Texel (m, em cima) do nível `k`; à direita, × a razão do degrau (`shadowStepAspect`). */
export function shadowTexelSize(t0: number, k: number): number {
    return t0 * 2 ** k;
}

/** A menor razão do texel à direita pelo em cima (o sol rasante; `CLOUD_SHADOW_ASPECT_MIN`). */
export const CLOUD_SHADOW_ASPECT_MIN = 0.2;
/** A elevação do sol (°) a partir da qual o texel é quadrado: a razão contínua é `tan(el)/tan(19°)`. */
export const CLOUD_SHADOW_ASPECT_ELEVATION = 19;
/** A folga da volta a um degrau mais grosso (`CLOUD_SHADOW_STEP_HYSTERESIS`): a contínua 5 % acima do limiar. */
export const CLOUD_SHADOW_STEP_HYSTERESIS = 1.05;
/** Quadros da mistura de um degrau ao vizinho (`CLOUD_SHADOW_STEP_FRAMES`). */
export const CLOUD_SHADOW_STEP_FRAMES = 32;
/** A página física fora dos mapas do quadro (`CLOUD_SHADOW_STEP_NONE`; os degraus são 0: 1, 1: ½, 2: 0,2). */
export const CLOUD_SHADOW_STEP_NONE = 3;

/** A razão do texel à direita pelo em cima do degrau `m` (espelho de `cloud_shadow_step_aspect`). */
export function shadowStepAspect(m: number): number {
    return m === 0 ? 1 : m === 1 ? 0.5 : CLOUD_SHADOW_ASPECT_MIN;
}

/** A razão contínua `tan(el)/tan(19°)` do sol (espelho de `cloud_shadow_continuous`). */
export function shadowContinuous(sun: Vec3): number {
    const y = Math.min(1, Math.max(-1, sun[1]));
    return (
        y
        / Math.max(Math.sqrt(Math.max(1 - y * y, 0)), 1e-6)
        / Math.tan((CLOUD_SHADOW_ASPECT_ELEVATION * Math.PI) / 180)
    );
}

/** O degrau da razão contínua `c` com os limiares × `h` (espelho de `cloud_shadow_step_of`). */
export function shadowStepOf(c: number, h = 1): number {
    if (c >= h) return 0;
    if (c >= 0.5 * h) return 1;
    return 2;
}

/**
 * O degrau que o sol pede com o mapa no degrau `now` (espelho de `cloud_shadow_step_target`): o mais fino logo que a
 * contínua cai abaixo do limiar (a razão nunca acima da contínua), o mais grosso só com a folga.
 */
export function shadowStepTarget(now: number, sun: Vec3): number {
    const c = shadowContinuous(sun);
    const fine = shadowStepOf(c);
    if (fine > now) return fine;
    return Math.min(now, shadowStepOf(c, CLOUD_SHADOW_STEP_HYSTERESIS));
}

/**
 * A razão `r` do texel à direita pelo em cima do mapa parado no degrau do sol (sem histórico: o degrau dos limiares, o
 * que o estado sem carimbo assume). Com o sol baixo a vizinha em cima é o mesmo caminho deslocado ao longo de si, e a à
 * direita é outro caminho de ~30 km pelo detalhe: a resolução que falta é a à direita, na medida de `tan(el)/tan(19°)`
 * (0,2 a 4°). Em degraus (1, ½, 0,2), nunca acima da contínua: a razão que mudasse a cada quadro escalaria o texel em
 * torno do pivô; a troca de degrau mistura os dois mapas ao longo de `CLOUD_SHADOW_STEP_FRAMES` quadros (`ShadowMaps`).
 */
export function shadowAspect(band: number, sun: Vec3): number {
    void band;
    return shadowStepAspect(shadowStepOf(shadowContinuous(sun)));
}

/**
 * Os mapas do quadro (espelho de `CloudShadowMaps`): o degrau de onde, o para onde e o peso do para onde na leitura (com
 * os dois iguais, só ele).
 */
export interface ShadowMaps {
    readonly leaving: number;
    readonly entering: number;
    readonly weight: number;
}

/** Os mapas parados no degrau do sol (o estado sem carimbo na série). */
export function shadowMapsOf(sun: Vec3): ShadowMaps {
    const s = shadowStepOf(shadowContinuous(sun));
    return { leaving: s, entering: s, weight: 1 };
}

/** O peso do degrau `m` na leitura (espelho de `cloud_shadow_step_weight`). */
export function shadowStepWeight(maps: ShadowMaps, m: number): number {
    if (maps.leaving === maps.entering) return m === maps.entering ? 1 : 0;
    if (m === maps.entering) return maps.weight;
    if (m === maps.leaving) return 1 - maps.weight;
    return 0;
}

/**
 * Os mapas do quadro antes da escolha (espelho de `cloud_shadow_maps_begin`): sem estado, o degrau do sol; a troca que
 * chegou ao peso 1 termina; parado, o sol que pede o degrau vizinho começa a troca (peso 0) e o que pede o degrau a dois
 * passos troca de uma vez; na troca, o sol que volta ao de onde a inverte (o peso complementar).
 */
export function shadowMapsBegin(prev: ShadowMaps | undefined, sun: Vec3): ShadowMaps {
    if (prev === undefined) return shadowMapsOf(sun);
    const maps =
        prev.leaving !== prev.entering && prev.weight >= 1
            ? { ...prev, leaving: prev.entering }
            : prev;
    const wanted = shadowStepTarget(maps.entering, sun);
    if (maps.leaving === maps.entering) {
        if (wanted === maps.entering) return { leaving: wanted, entering: wanted, weight: 1 };
        if (Math.abs(wanted - maps.entering) === 1)
            return { leaving: maps.entering, entering: wanted, weight: 0 };
        return { leaving: wanted, entering: wanted, weight: 1 };
    }
    if (wanted === maps.leaving)
        return { leaving: maps.entering, entering: maps.leaving, weight: 1 - maps.weight };
    return maps;
}

/**
 * O estado gravado depois da escolha (espelho do fim de `cloud_shadow_select_main`): na troca, com todas as páginas do
 * mapa novo valendo depois do desenho do quadro (`pending` 0: nenhuma inválida fora das escolhidas), o peso sobe
 * `1/CLOUD_SHADOW_STEP_FRAMES`.
 */
export function shadowMapsEnd(maps: ShadowMaps, pending: number): ShadowMaps {
    if (maps.leaving === maps.entering || pending > 0) return maps;
    return { ...maps, weight: Math.min(maps.weight + 1 / CLOUD_SHADOW_STEP_FRAMES, 1) };
}

/**
 * Páginas da janela à direita do degrau `m` (espelho de `cloud_shadow_step_pages`): o raio útil em metros do em cima
 * (8, 14 e 32).
 */
export function shadowStepPages(m: number): number {
    const useful = (CLOUD_SHADOW_PAGES / 2 - 1) * CLOUD_SHADOW_PAGE - 2;
    return 2 * (Math.ceil((useful / shadowStepAspect(m) + 2) / CLOUD_SHADOW_PAGE) + 1);
}

/** A primeira página física à direita do degrau `m` no nível (espelho de `cloud_shadow_step_base`). */
export function shadowStepBase(m: number): number {
    return m === 1 ? shadowStepPages(2) : 0;
}

/** Raio útil (m, Chebyshev, o mesmo nos dois eixos) do nível `k` em volta da câmera: a janela menos a borda. */
export function shadowUsable(t0: number, k: number): number {
    return ((CLOUD_SHADOW_PAGES / 2 - 1) * CLOUD_SHADOW_PAGE - 2) * shadowTexelSize(t0, k);
}

/** O degrau `m` dado ou o do mapa para onde do quadro. */
const stepOf = (f: ShadowFrame, m?: number): number =>
    m ?? (f.maps ?? shadowMapsOf(f.sun)).entering;

/** O texel (m, à direita e em cima) do nível `k` no degrau `m` (o para onde do quadro, sem ele). */
function texelOf(f: ShadowFrame, k: number, m?: number): [number, number] {
    const t = shadowTexelSize(f.texel, k);
    return [t * shadowStepAspect(stepOf(f, m)), t];
}

/** As páginas da janela do degrau `m` (à direita, em cima; o para onde do quadro, sem ele). */
export function shadowWindowPages(f: ShadowFrame, m?: number): [number, number] {
    return [shadowStepPages(stepOf(f, m)), CLOUD_SHADOW_PAGES];
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
    /** Os mapas do quadro (sem eles, parados no degrau do sol). */
    readonly maps?: ShadowMaps;
}

/** Coordenadas (m) de `p` no plano do mapa. */
export function shadowPlane(f: ShadowFrame, p: Vec3): [number, number] {
    const rel = [p[0] - f.pivot[0], p[1] - f.pivot[1], p[2] - f.pivot[2]];
    return [dot(rel, f.right), dot(rel, f.up)];
}

/** Primeira página global da janela do nível `k` no degrau `m` (o para onde do quadro, sem ele). */
export function shadowWindow(f: ShadowFrame, k: number, m?: number): [number, number] {
    const t = texelOf(f, k, m);
    const n = shadowWindowPages(f, m);
    return [
        Math.floor(f.camera[0] / (CLOUD_SHADOW_PAGE * t[0])) - n[0] / 2,
        Math.floor(f.camera[1] / (CLOUD_SHADOW_PAGE * t[1])) - n[1] / 2,
    ];
}

const mod = (a: number, n: number): number => ((a % n) + n) % n;

/** As páginas físicas de um nível. */
const LEVEL_SLOTS = CLOUD_SHADOW_PAGES_X * CLOUD_SHADOW_PAGES;

/** A página física da página global `g` do nível `k` no degrau `m` (endereço toroidal na janela do degrau). */
export function shadowSlot(k: number, g: readonly [number, number], m: number): number {
    return (
        k * LEVEL_SLOTS
        + mod(g[1], CLOUD_SHADOW_PAGES) * CLOUD_SHADOW_PAGES_X
        + shadowStepBase(m)
        + mod(g[0], shadowStepPages(m))
    );
}

/** Texel do canto da página física `slot` no atlas. */
export function shadowSlotOrigin(slot: number): [number, number] {
    return [
        (slot % CLOUD_SHADOW_SLOTS_X) * CLOUD_SHADOW_STRIDE,
        Math.floor(slot / CLOUD_SHADOW_SLOTS_X) * CLOUD_SHADOW_STRIDE,
    ];
}

/** O degrau da página física `slot` nos mapas `maps` (espelho de `cloud_shadow_slot_step`). */
export function shadowSlotStep(slot: number, maps: ShadowMaps): number {
    const col = (slot % LEVEL_SLOTS) % CLOUD_SHADOW_PAGES_X;
    const has = (m: number): boolean => maps.leaving === m || maps.entering === m;
    if (col >= shadowStepBase(1)) return has(1) ? 1 : CLOUD_SHADOW_STEP_NONE;
    if (has(2)) return 2;
    if (has(0) && col < shadowStepPages(0)) return 0;
    return CLOUD_SHADOW_STEP_NONE;
}

/**
 * A página global que a janela do quadro põe na página física `slot`, o degrau dela e se ela está nos mapas do quadro
 * (espelho de `cloud_shadow_slot_step` e `cloud_shadow_slot_page`).
 */
export function shadowSlotPage(
    f: ShadowFrame,
    slot: number,
): { level: number; step: number; page: [number, number]; active: boolean } {
    const k = Math.floor(slot / LEVEL_SLOTS);
    const step = shadowSlotStep(slot, f.maps ?? shadowMapsOf(f.sun));
    if (step === CLOUD_SHADOW_STEP_NONE) return { level: k, step, page: [0, 0], active: false };
    const r = slot % LEVEL_SLOTS;
    const s = [
        (r % CLOUD_SHADOW_PAGES_X) - shadowStepBase(step),
        Math.floor(r / CLOUD_SHADOW_PAGES_X),
    ];
    const w = shadowWindow(f, k, step);
    const page: [number, number] = [
        w[0] + mod(s[0]! - w[0], shadowStepPages(step)),
        w[1] + mod(s[1]! - w[1], CLOUD_SHADOW_PAGES),
    ];
    return { level: k, step, page, active: true };
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
 * Coordenadas (texels, contínuas) no atlas do ponto `x` do plano no nível `k` do degrau `m` (o para onde do quadro, sem
 * ele): o texel global preso à janela, a página pela posição do par do filtro (os dois texels do filtro na mesma página
 * física, o segundo podendo ser a coluna da vizinha) e o canto da página física.
 */
export function shadowAtlasTexel(
    f: ShadowFrame,
    x: readonly [number, number],
    k: number,
    m?: number,
): [number, number] {
    const step = stepOf(f, m);
    const t = texelOf(f, k, step);
    const w = shadowWindow(f, k, step);
    const P = CLOUD_SHADOW_PAGE;
    const N = shadowWindowPages(f, step);
    const out: number[] = [];
    const page: [number, number] = [0, 0];
    for (let a = 0; a < 2; a++) {
        const X = Math.min(Math.max(x[a]! / t[a]!, w[a]! * P + 0.5), (w[a]! + N[a]!) * P - 0.5);
        const g = Math.min(Math.max(Math.floor((X - 0.5) / P), w[a]!), w[a]! + N[a]! - 1);
        page[a] = g;
        out.push(X - g * P);
    }
    const o = shadowSlotOrigin(shadowSlot(k, page, step));
    return [o[0] + out[0]!, o[1] + out[1]!];
}

/**
 * O mapa lido de volta: `rgba16float` de `CLOUD_SHADOW_ATLAS²` × 4 camadas (4 nós por camada) e, opcionais, o sol do
 * desenho de cada página física (3 por página; o registro da série) e os mapas do quadro (o registro de estado).
 */
export interface ShadowAtlas {
    readonly width: number;
    readonly height: number;
    readonly depth: number;
    readonly data: Float32Array;
    readonly suns?: Float32Array;
    readonly maps?: ShadowMaps;
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

/** Os mapas do quadro como a GPU os leu (o registro de estado lido; sem ele, os do quadro ou parados no degrau do sol). */
function mapsOf(map: ShadowAtlas, f: ShadowFrame): ShadowMaps {
    return map.maps ?? f.maps ?? shadowMapsOf(f.sun);
}

/**
 * O texel contínuo no atlas de `p` no nível `k` do degrau `m` (espelho de `cloud_shadow_page_at` e
 * `cloud_shadow_page_uv`): a página escolhida pelo plano do quadro, o ponto lido pelo plano do sol do desenho dela.
 */
export function shadowPageTexel(
    map: ShadowAtlas,
    f: ShadowFrame,
    p: Vec3,
    k: number,
    m = mapsOf(map, f).entering,
): { texel: [number, number]; sun: Vec3 } {
    const x = shadowPlane(f, p);
    const t = texelOf(f, k, m);
    const w = shadowWindow(f, k, m);
    const P = CLOUD_SHADOW_PAGE;
    const N = shadowWindowPages(f, m);
    const g = [0, 1].map((a) => {
        const X = Math.min(Math.max(x[a]! / t[a]!, w[a]! * P + 0.5), (w[a]! + N[a]!) * P - 0.5);
        return Math.min(Math.max(Math.floor((X - 0.5) / P), w[a]!), w[a]! + N[a]! - 1);
    }) as [number, number];
    const slot = shadowSlot(k, g, m);
    const sun = shadowPageSun(map, f, slot);
    const b = shadowBasis(sun);
    const xr = shadowPlane({ ...f, right: b.right, up: b.up }, p);
    const o = shadowSlotOrigin(slot);
    const texel = [0, 1].map((a) => {
        const lo = g[a]! * P;
        const X = Math.min(Math.max(xr[a]! / t[a]!, lo + 0.5), lo + P + 0.5);
        return o[a]! + X - lo;
    }) as [number, number];
    return { texel, sun };
}

/** O nó `n` em `p` num degrau: os dois níveis misturados na faixa de transição, cada página pelo sol dela. */
function shadowKnotStep(map: ShadowAtlas, f: ShadowFrame, p: Vec3, n: number, m: number): number {
    const [k, b] = shadowLevel(f, shadowPlane(f, p));
    const a = shadowAtlasKnot(map, shadowPageTexel(map, f, p, k, m).texel, n);
    if (b <= 0) return a;
    return a + (shadowAtlasKnot(map, shadowPageTexel(map, f, p, k + 1, m).texel, n) - a) * b;
}

/**
 * O nó `n` em `p` como a GPU o lê (espelho de `cloud_shadow_knot`): os dois níveis misturados na faixa de transição e,
 * na troca de degrau, os dois mapas pelo peso.
 */
export function shadowKnotAt(map: ShadowAtlas, f: ShadowFrame, p: Vec3, n: number): number {
    const maps = mapsOf(map, f);
    const a = shadowKnotStep(map, f, p, n, maps.entering);
    if (maps.leaving === maps.entering || maps.weight >= 1) return a;
    const b = shadowKnotStep(map, f, p, n, maps.leaving);
    return a + (b - a) * (1 - maps.weight);
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
    const e = shadowPageErrorParts(rec, now, corners);
    return e.lateral + e.other;
}

/** As partes da mudança prevista: a do deslocamento lateral (ΔT), a dos nós e da evolução (ΔT) e o deslocamento (m). */
export interface ShadowPageErrorParts {
    readonly lateral: number;
    readonly other: number;
    readonly displacement: number;
}

/** A mudança prevista em partes (espelho de `cloud_shadow_error`; `shadowPageError` é a soma). */
export function shadowPageErrorParts(
    rec: ShadowPageRecord,
    now: ShadowPageNow,
    corners: readonly (readonly [number, number])[],
): ShadowPageErrorParts {
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
    return {
        lateral: CLOUD_SHADOW_GRADIENT_SAFETY * rec.gradient * lateral,
        other: rec.along * knots + evolution,
        displacement: lateral,
    };
}

/** A pegada (m) de um pixel da tela a `distance` m da câmera (`P11` o termo [1][1] da projeção, `height` a altura em px). */
export function shadowPixelFootprint(distance: number, p11: number, height: number): number {
    return height > 0 ? (distance * 2) / (p11 * height) : 0;
}

/**
 * O deslocamento na tela (px) abaixo do qual o desenho deslocado da página não é visto (T074): a amostra temporal da
 * imagem reconstrói o movimento abaixo do pixel, e a meia largura do pixel é a resolução da posição na tela.
 */
export const CLOUD_SHADOW_PIXEL_TOLERANCE = 0.5;

/**
 * A mudança da página na unidade da tolerância de base (`CLOUD_SHADOW_TOLERANCE`; T074; espelho de
 * `cloud_shadow_screen_error`), projetada na tela. Na vista da câmera (`footprint` a pegada do pixel na coluna mais perto
 * dela): a parte lateral — o desenho que a página mostra deslocado pelo sol que anda e pelo vento que sobra — conta pela
 * fração do deslocamento na tela (`min(1, px / CLOUD_SHADOW_PIXEL_TOLERANCE)`), e a medida pelas provas também quando a
 * prevista é lateral; os nós e a evolução contam inteiros; e o pixel maior que o texel faz a média dos texels
 * (`× min(1, texel/pegada)`). Fora da vista, a maior mudança na tolerância de quem a lê (`CLOUD_SHADOW_HIDDEN_TOLERANCE`).
 */
export function shadowScreenError(
    parts: ShadowPageErrorParts,
    measured: number,
    visible: boolean,
    texel: number,
    footprint: number,
): number {
    const total = Math.min(Math.max(parts.lateral + parts.other, measured), 1);
    if (!visible) return (total * CLOUD_SHADOW_TOLERANCE) / CLOUD_SHADOW_HIDDEN_TOLERANCE;
    if (footprint <= 0) return total;
    const w = Math.min(1, parts.displacement / footprint / CLOUD_SHADOW_PIXEL_TOLERANCE);
    const probe = parts.lateral >= parts.other ? measured * w : measured;
    const e = Math.min(Math.max(parts.lateral * w + parts.other, probe), 1);
    return footprint > texel ? (e * texel) / footprint : e;
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
 * A prioridade de uma página inválida (`cloud_shadow_select_main`): a mudança prevista em tolerâncias (no máximo 1: a
 * transmitância não muda mais que isso) × os quadros desde o desenho (a página que espera sobe na fila: nenhuma fica
 * para sempre fora do orçamento), × √2 por nível mais fino (perto da câmera primeiro) e × 4 vista pela câmera. Na fila,
 * em meias oitavas (`shadowPageKey`), da maior à menor.
 */
export function shadowPagePriority(
    error: number,
    level: number,
    visible: boolean,
    age: number,
): number {
    return (
        (Math.min(error, 1) / CLOUD_SHADOW_TOLERANCE)
        * Math.max(age, 1)
        * 2 ** ((CLOUD_SHADOW_LEVELS - 1 - level) / 2)
        * (visible ? 4 : 1)
    );
}

/** A fila das páginas que têm de ser desenhadas no quadro; as inválidas ficam nas filas 1…`CLOUD_SHADOW_KEY_MANDATORY − 1`. */
export const CLOUD_SHADOW_KEY_MANDATORY = 47;

/**
 * A fila de uma página inválida pela prioridade (`cloud_shadow_key`): meias oitavas, `1 + ⌊2·log2 p⌋`, de 1 a
 * `CLOUD_SHADOW_KEY_MANDATORY − 1`. A escolha do quadro toma as filas da maior à menor e, dentro da fila do corte, pela
 * ordem da página física. A maior prioridade (a mudança 1, `CLOUD_SHADOW_MAX_AGE` quadros, o nível 0 e vista) fica
 * abaixo da última fila: as filas não saturam, e a idade ordena as páginas que mudam juntas (o sol que anda).
 */
export function shadowPageKey(priority: number): number {
    return Math.min(
        Math.max(1 + Math.floor(2 * Math.log2(Math.max(priority, 1e-30))), 1),
        CLOUD_SHADOW_KEY_MANDATORY - 1,
    );
}

/** O custo de uma amostra com nuvem em amostras vazias no desenho de uma coluna (`CLOUD_SHADOW_CLOUDY_COST`, T074). */
export const CLOUD_SHADOW_CLOUDY_COST = 4;
/** O custo de referência de uma página: os 289 texels com 192 amostras vazias (`CLOUD_SHADOW_PAGE_REF_COST`). */
export const CLOUD_SHADOW_PAGE_REF_COST = 289 * 192;

/** O custo do desenho de uma coluna com `samples` amostras, `cloudy` delas com nuvem (1 a mais: a coluna fora da casca). */
export function shadowColumnCost(samples: number, cloudy: number): number {
    return 1 + samples - cloudy + CLOUD_SHADOW_CLOUDY_COST * cloudy;
}

/**
 * As páginas do quadro pelo custo (espelho do corte de `cloud_shadow_select_main`, T074): as obrigatórias todas e, da fila
 * mais alta à mais baixa, as inválidas até o orçamento de custo (`budget` páginas de referência); dentro da fila do corte,
 * pela ordem da página física, entra a que começa antes do custo que sobra. `pages`: a fila (0: fora) e o custo previsto
 * de cada uma, na ordem física. Devolve os índices escolhidos.
 */
export function shadowSelectByCost(
    pages: readonly { readonly key: number; readonly cost: number }[],
    budget: number,
): number[] {
    const hist = new Array<number>(CLOUD_SHADOW_KEY_MANDATORY + 1).fill(0);
    for (const p of pages) if (p.key > 0) hist[p.key]! += p.cost;
    let left = budget * CLOUD_SHADOW_PAGE_REF_COST;
    let cut: [number, number] = [CLOUD_SHADOW_KEY_MANDATORY, hist[CLOUD_SHADOW_KEY_MANDATORY]!];
    left -= Math.min(left, cut[1]);
    for (let b = CLOUD_SHADOW_KEY_MANDATORY - 1; b >= 1; b--) {
        if (left === 0) break;
        cut = [b, Math.min(hist[b]!, left)];
        left -= cut[1];
    }
    const out: number[] = [];
    let spent = 0;
    pages.forEach((p, i) => {
        if (p.key > cut[0]) out.push(i);
        else if (p.key === cut[0] && p.key > 0) {
            if (cut[0] === CLOUD_SHADOW_KEY_MANDATORY || spent < cut[1]) out.push(i);
            spent += p.cost;
        }
    });
    return out;
}
