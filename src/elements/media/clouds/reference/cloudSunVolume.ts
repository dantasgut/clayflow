// Referência f64 do volume de τ até o sol perto da câmera (spec 041, T074): os nós de uma grade no referencial das nuvens
// em níveis (o nível `k` com células de `CLOUD_SUN_VOLUME_CELL · 2^k` m no plano; a casca em `páginas ·
// CLOUD_SUN_VOLUME_PAGE` células na altura em todos), cada um com a profundidade ótica do trecho de `L` m dele para o sol —
// a parte do cone curto da luz além da primeira amostra — e o resto da luz do fim do trecho, em páginas de 8³ células numa
// janela toroidal de cada nível em volta da câmera; a leitura no nível mais fino que contém o ponto, pela interpolação
// trilinear dos nós da página; a mudança de cada parte de uma página estimada pela taxa medida no desenho anterior (|Δτ|
// médio dos nós de prova por metro do deslocamento: no cone, `L·Δθ_sol` mais a deriva do detalhe; no resto, o braço
// `CLOUD_SUN_VOLUME_REST_ARM` no lugar de `L`) e a fila do desenho. Espelho de `cloud_sun_volume*.wgsl`. Só para testes: a
// produção não importa daqui.
import { altitude, cloudDensity, type CloudModel, type Vec3 } from './cloudModel';
import {
    CLOUD_SUN_VOLUME_CELL,
    CLOUD_SUN_VOLUME_REST_FOOTPRINT,
    CLOUD_SUN_VOLUME_INVALID,
    CLOUD_SUN_VOLUME_LEVELS,
    CLOUD_SUN_VOLUME_MAX_SPACING,
    CLOUD_SUN_VOLUME_PAGE,
    CLOUD_SUN_VOLUME_PAGES,
    CLOUD_SUN_VOLUME_PROBES,
    CLOUD_SUN_VOLUME_RATE,
    CLOUD_SUN_VOLUME_RATE_FLOOR,
    CLOUD_SUN_VOLUME_REST_ARM,
    CLOUD_SUN_VOLUME_REST_LIFE,
    CLOUD_SUN_VOLUME_SAMPLES,
    CLOUD_SUN_VOLUME_STRIDE,
    CLOUD_SUN_VOLUME_TOLERANCE,
} from '../schemas';

export {
    CLOUD_SUN_VOLUME_CELL,
    CLOUD_SUN_VOLUME_REST_FOOTPRINT,
    CLOUD_SUN_VOLUME_INVALID,
    CLOUD_SUN_VOLUME_LEVELS,
    CLOUD_SUN_VOLUME_REST_ARM,
    CLOUD_SUN_VOLUME_PAGE,
    CLOUD_SUN_VOLUME_PAGES,
    CLOUD_SUN_VOLUME_PROBES,
    CLOUD_SUN_VOLUME_RATE,
    CLOUD_SUN_VOLUME_RATE_FLOOR,
    CLOUD_SUN_VOLUME_SAMPLES,
    CLOUD_SUN_VOLUME_STRIDE,
    CLOUD_SUN_VOLUME_TOLERANCE,
};

/** Células da casca na altura. */
export const CLOUD_SUN_VOLUME_LAYERS = CLOUD_SUN_VOLUME_PAGES[1] * CLOUD_SUN_VOLUME_PAGE;

/** O cone curto da luz (`cloud_sun_depth`): a base `espessura/48` e os trechos `0,5 · 1,5^i` dela. */
export function sunConeBase(thickness: number): number {
    return thickness / 48;
}

/** O comprimento (m) do cone de `steps` trechos: `base · (1,5^steps − 1)`. */
export function sunConeExtent(base: number, steps: number): number {
    return base * (1.5 ** steps - 1);
}

/**
 * O trecho (m) que cada nó integra: o cone menos a primeira amostra (`0,5 · base`), que a marcha segue fazendo no ponto
 * (a borda escura da nuvem, que a interpolação dos nós alisaria).
 */
export function sunVolumeLength(base: number, steps: number): number {
    return sunConeExtent(base, steps) - 0.5 * base;
}

/** O lado (m) da célula na altura: a casca em `CLOUD_SUN_VOLUME_LAYERS` células; `undefined` acima do teto. */
export function sunVolumeSpacing(thickness: number): number | undefined {
    const v = thickness / CLOUD_SUN_VOLUME_LAYERS;
    return v <= CLOUD_SUN_VOLUME_MAX_SPACING ? v : undefined;
}

/** A grade no quadro: o deslocamento do referencial das nuvens (x, z; m), o lado da célula no plano e o da altura. */
export interface SunVolumeGrid {
    readonly offset: readonly [number, number];
    readonly cell: number;
    readonly spacing: number;
}

/** O ponto de mundo do nó global `g` (x e z no plano das células, y a camada da casca; a altura pela sagita). */
export function sunVolumeNode(m: CloudModel, grid: SunVolumeGrid, g: Vec3): Vec3 {
    const x = grid.offset[0] + g[0] * grid.cell;
    const z = grid.offset[1] + g[2] * grid.cell;
    const alt = m.base + g[1] * grid.spacing;
    const R = m.groundRadius;
    return [x, alt - (x * x + z * z) / (2 * (R + alt)), z];
}

/** As coordenadas contínuas de nó de um ponto (x, z no plano; y pela altitude na casca). */
export function sunVolumeCoords(m: CloudModel, grid: SunVolumeGrid, p: Vec3): Vec3 {
    return [
        (p[0] - grid.offset[0]) / grid.cell,
        (altitude(m, p) - m.base) / grid.spacing,
        (p[2] - grid.offset[1]) / grid.cell,
    ];
}

/**
 * O τ de um nó (espelho de `cloud_sun_volume_value`): a densidade no meio de `CLOUD_SUN_VOLUME_SAMPLES` partes iguais do
 * trecho `[0, L]` de `x` para o sol, × a extinção.
 */
export function sunVolumeValue(
    m: CloudModel,
    x: Vec3,
    sun: Vec3,
    length: number,
    samples = CLOUD_SUN_VOLUME_SAMPLES,
): number {
    const dt = length / samples;
    let tau = 0;
    for (let i = 0; i < samples; i++) {
        const t = (i + 0.5) * dt;
        tau += cloudDensity(m, [x[0] + sun[0] * t, x[1] + sun[1] * t, x[2] + sun[2] * t]) * dt;
    }
    return tau * m.density;
}

/** A página global (x, camada, z) que contém as coordenadas de nó `c` (a camada presa na casca). */
export function sunVolumePageOf(c: Vec3): [number, number, number] {
    const P = CLOUD_SUN_VOLUME_PAGE;
    return [
        Math.floor(c[0] / P),
        Math.min(Math.max(Math.floor(c[1] / P), 0), CLOUD_SUN_VOLUME_PAGES[1] - 1),
        Math.floor(c[2] / P),
    ];
}

/** O primeiro índice global da janela num eixo do plano (a página da câmera menos a metade). */
export function sunVolumeWindowStart(camera: number, pages: number): number {
    return camera - Math.floor(pages / 2);
}

/** A página global está na janela da câmera (num eixo do plano)? */
export function sunVolumeInWindow(global: number, camera: number, pages: number): boolean {
    const s = sunVolumeWindowStart(camera, pages);
    return global >= s && global < s + pages;
}

/** O lugar físico (no endereço toroidal) de uma página global num eixo do plano. */
export function sunVolumePhysical(global: number, pages: number): number {
    return ((global % pages) + pages) % pages;
}

/** A página global que a janela da câmera põe no lugar físico `physical` (o inverso de `sunVolumePhysical` na janela). */
export function sunVolumeGlobalAt(physical: number, camera: number, pages: number): number {
    const s = sunVolumeWindowStart(camera, pages);
    return s + sunVolumePhysical(physical - s, pages);
}

/** A página global da câmera no nível `k` (a do nível 0 dividida por `2^k`, por baixo). */
export function sunVolumeCameraAt(camera0: number, k: number): number {
    return Math.floor(camera0 / 2 ** k);
}

/**
 * A leitura num nível (espelho do laço de `cloud_sun_volume_at`): a interpolação trilinear dos nós da página que contém o
 * ponto (`node` devolve o valor do nó global), ou `undefined` fora da janela, abaixo da base ou acima do topo da casca.
 * `c`: as coordenadas de nó no nível; `camera`: a página da câmera no nível.
 */
export function sunVolumeLookup(
    c: Vec3,
    camera: readonly [number, number],
    node: (g: Vec3) => number,
): number | undefined {
    if (c[1] < 0 || c[1] > CLOUD_SUN_VOLUME_LAYERS) return undefined;
    const pg = sunVolumePageOf(c);
    if (
        !sunVolumeInWindow(pg[0], camera[0], CLOUD_SUN_VOLUME_PAGES[0])
        || !sunVolumeInWindow(pg[2], camera[1], CLOUD_SUN_VOLUME_PAGES[2])
    )
        return undefined;
    const P = CLOUD_SUN_VOLUME_PAGE;
    const l = [c[0] - pg[0] * P, c[1] - pg[1] * P, c[2] - pg[2] * P].map((v) =>
        Math.min(Math.max(v, 0), P),
    );
    const i0 = l.map((v) => Math.min(Math.floor(v), P - 1));
    const f = l.map((v, k) => v - i0[k]!);
    let tau = 0;
    for (let corner = 0; corner < 8; corner++) {
        const o = [corner & 1, (corner >> 1) & 1, (corner >> 2) & 1];
        const w = o.reduce((a, b, k) => a * (b ? f[k]! : 1 - f[k]!), 1);
        if (w === 0) continue;
        tau +=
            w
            * node([
                pg[0] * P + i0[0]! + o[0]!,
                pg[1] * P + i0[1]! + o[1]!,
                pg[2] * P + i0[2]! + o[2]!,
            ]);
    }
    return tau;
}

/**
 * O nível que a leitura usa (espelho de `cloud_sun_volume_at`): o mais fino cuja janela contém o ponto (`inWindow(k)`);
 * senão `undefined` (o cone).
 */
export function sunVolumeLevel(inWindow: (k: number) => boolean): number | undefined {
    for (let k = 0; k < CLOUD_SUN_VOLUME_LEVELS; k++) if (inWindow(k)) return k;
    return undefined;
}

/** O resto da luz vale no nível de célula `cell` com a pegada `footprint` (m) do pixel da marcha (o nível 0 sempre)? */
export function sunVolumeRestAllowed(cell: number, cell0: number, footprint: number): boolean {
    return cell <= Math.max(CLOUD_SUN_VOLUME_REST_FOOTPRINT * footprint, cell0);
}

/**
 * O peso do nível no anel de fora da janela (espelho de `cloud_sun_volume_at`): a distância (páginas) do ponto à borda
 * da janela, até 1 — abaixo, o nível seguinte (ou, no último, o cone) entra por `1 − peso`. `rel`: a posição em páginas
 * desde o começo da janela.
 */
export function sunVolumeBlend(rel: readonly [number, number]): number {
    const [nx, nz] = [CLOUD_SUN_VOLUME_PAGES[0], CLOUD_SUN_VOLUME_PAGES[2]];
    return Math.min(1, Math.max(0, Math.min(rel[0], rel[1], nx - rel[0], nz - rel[1])));
}

/**
 * A parte do cone da luz com o volume (espelho do ramo do volume em `cloud_sun_depth`): a primeira amostra do cone no
 * ponto (o trecho de `0,5 · base`) e, do fim dela, o volume lido. `undefined` onde a página não vale.
 */
export function sunConeWithVolume(
    m: CloudModel,
    p: Vec3,
    sun: Vec3,
    base: number,
    lookup: (q: Vec3) => number | undefined,
): number | undefined {
    const d0 = 0.5 * base;
    const v = lookup([p[0] + sun[0] * d0, p[1] + sun[1] * d0, p[2] + sun[2] * d0]);
    if (v === undefined) return undefined;
    const h = 0.5 * d0;
    return (
        cloudDensity(m, [p[0] + sun[0] * h, p[1] + sun[1] * h, p[2] + sun[2] * h]) * d0 * m.density
        + v
    );
}

/** O cone curto da luz sem o volume (o laço de `cloud_sun_depth` até o fim do cone, × a extinção). */
export function sunCone(m: CloudModel, p: Vec3, sun: Vec3, base: number, steps: number): number {
    let tau = 0;
    let t = 0;
    for (let i = 0; i < steps; i++) {
        const len = base * 0.5 * 1.5 ** i;
        const s = t + 0.5 * len;
        tau += cloudDensity(m, [p[0] + sun[0] * s, p[1] + sun[1] * s, p[2] + sun[2] * s]) * len;
        t += len;
    }
    return tau * m.density;
}

/** O ângulo (rad) entre duas direções unitárias pela corda (`cloud_scatter_angle`). */
export function sunVolumeAngle(a: Vec3, b: Vec3): number {
    const d = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    return 2 * Math.asin(Math.min(Math.max(0.5 * d, 0), 1));
}

/** O deslocamento (m) do fim do trecho desde o desenho: o sol que virou `angle` rad e a deriva `drift` m do detalhe. */
export function sunVolumeMotion(length: number, angle: number, drift: number): number {
    return length * angle + drift;
}

/** O que o registro de uma página guarda do desenho (espelho de `cloud_sun_volume.wgsl`). */
export interface SunVolumeRecord {
    readonly sun: Vec3;
    /** O tempo simulado do desenho (s). */
    readonly time: number;
    /** As taxas medidas (|Δτ| médio dos nós de prova por metro do deslocamento) do cone e do resto, ou as de partida. */
    readonly rate: number;
    readonly restRate: number;
    /** Os τ médios dos nós de prova (a escala da evolução da cobertura). */
    readonly tau: number;
    readonly restTau: number;
}

/** O que o quadro vê: o sol, o tempo, a deriva do detalhe (m/s), o trecho e a evolução da cobertura (s; 0 sem). */
export interface SunVolumeNow {
    readonly sun: Vec3;
    readonly time: number;
    readonly driftRate: number;
    readonly length: number;
    readonly evolution: number;
}

/**
 * A mudança estimada de τ de cada parte (o cone, o resto; a média nos nós de prova) desde o desenho (espelho de
 * `cloud_sun_volume_change`): a taxa × o deslocamento (no cone, o do fim do trecho; no resto, o do braço) e, com a
 * cobertura que evolui no tempo, o τ médio × a idade ÷ a evolução.
 */
export function sunVolumeChange(r: SunVolumeRecord, now: SunVolumeNow): [number, number] {
    const age = Math.max(now.time - r.time, 0);
    const angle = sunVolumeAngle(r.sun, now.sun);
    const drift = now.driftRate * age;
    const e = now.evolution > 0 ? age / now.evolution : 0;
    return [
        r.rate * sunVolumeMotion(now.length, angle, drift) + r.tau * e,
        r.restRate * sunVolumeMotion(CLOUD_SUN_VOLUME_REST_ARM, angle, drift) + r.restTau * e,
    ];
}

/**
 * A taxa medida no desenho (espelho de `cloud_sun_volume_rate`): |Δτ| médio dos nós de prova entre o desenho de antes e o
 * de agora ÷ o deslocamento entre eles, com o piso; sem deslocamento que meça (abaixo de 1 m), a de antes.
 */
export function sunVolumeRate(meanDelta: number, motion: number, before: number): number {
    if (motion < 1) return before;
    return Math.max(meanDelta / motion, CLOUD_SUN_VOLUME_RATE_FLOOR);
}

/**
 * A mudança que conta na fila (espelho de `cloud_sun_volume_keys_main`): a do cone e, quando no ritmo medido o resto
 * redesenhado vale por pelo menos `CLOUD_SUN_VOLUME_REST_LIFE` s no nível `k`, a dele.
 */
export function sunVolumeQueued(change: readonly [number, number], age: number, k: number): number {
    const worth =
        (change[1] / Math.max(age, 1 / 60)) * CLOUD_SUN_VOLUME_REST_LIFE
        < CLOUD_SUN_VOLUME_INVALID * 2 ** k;
    return Math.max(change[0], worth ? change[1] : 0);
}

/**
 * A fila de uma página do nível `k` (espelho de `cloud_sun_volume_key`): 24…31 sem desenho que valha (os níveis finos e
 * as perto da câmera antes), 1…23 pela mudança em tolerâncias do nível (`CLOUD_SUN_VOLUME_TOLERANCE · 2^k`), 0 nada.
 */
export function sunVolumeKey(
    current: boolean,
    change: number,
    k: number,
    distancePages: number,
): number {
    if (!current) return 31 - Math.min(2 * k + Math.floor(distancePages / 5), 7);
    const tolerance = CLOUD_SUN_VOLUME_TOLERANCE * 2 ** k;
    if (change < tolerance) return 0;
    return Math.min(Math.max(1 + Math.floor(2 * Math.log2(change / tolerance)), 1), 23);
}

/**
 * Uma parte da página vale na leitura do nível `k`: o desenho é desta janela e do conteúdo de agora, e a mudança estimada
 * dela fica abaixo do teto do nível (`CLOUD_SUN_VOLUME_INVALID · 2^k`).
 */
export function sunVolumeValid(current: boolean, change: number, k = 0): boolean {
    return current && change < CLOUD_SUN_VOLUME_INVALID * 2 ** k;
}

/** Os nós de prova de uma página: os de índice múltiplo de 23 entre os 9³ (32 nós espalhados). */
export function sunVolumeProbeNodes(): number[] {
    const n = CLOUD_SUN_VOLUME_STRIDE ** 3;
    const out: number[] = [];
    for (let j = 0; j < n && out.length < CLOUD_SUN_VOLUME_PROBES; j += 23) out.push(j);
    return out;
}
