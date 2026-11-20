// Referência da reconstrução temporal das nuvens (spec 041, R2; `cloud_reconstruct.wgsl`): por pixel do alvo de ¼, o
// histórico reprojetado (o pixel marchado no quadro mistura o valor do bloco a ele, média exponencial) — salvo quando o
// gradiente temporal filtrado reprova o bloco (a média dos históricos reprojetados nos pixels marchados dos 3 × 3 blocos
// em volta diverge da média dos valores exatos deles além da tolerância mais o ruído esperado da média — o erro padrão
// das amostras, R19: Schied et al. 2018; a lição dos blocos 2 × 2
// da 034), quando o histórico sai da tela ou quando a série não vale (corte, recriação, primeiro quadro): aí, o valor do
// bloco. O histórico é recortado pela caixa dos valores exatos dos 3 × 3 blocos, com folga de metade da largura, na
// medida da incerteza da reprojeção (`clip`: 0 com a câmera parada ou girando, 1 com a paralaxe de um texel ou mais).
// A superfície: o histórico só vale marchado até a mesma superfície do pixel agora, e o valor do bloco só é o do pixel
// marchado se este for da mesma superfície (senão, o do bloco vizinho mais parecido, `cloudFreshForSurface`).
// O ruído esperado inclui o temporal de cada pixel (o segundo momento guardado na série `marchDepth`): a amostra de um
// pixel de ¼ numa faixa de 1–2 px oscila muito mais que a dispersão entre os blocos mostra.

import { luminance as rec709 } from '../../../math/reference/color';

export type Rgba = readonly [number, number, number, number];

/** Tolerância do gradiente temporal. */
export const CLOUD_GRADIENT_TOLERANCE = 0.2;
/** Folga da caixa do recorte do histórico (fração da largura dela). */
export const CLOUD_BOX_PAD = 0.5;
/** Peso do valor novo no pixel marchado (média exponencial sobre o histórico recortado). */
export const CLOUD_HISTORY_BLEND = 0.25;
/** Distância guardada do fundo (nenhuma superfície), m. */
export const CLOUD_SKY_DISTANCE = 1e7;
/** Diferença relativa até a qual duas distâncias de superfície são a mesma superfície para as nuvens. */
export const CLOUD_SURFACE_AGREE = 1;

/** A diferença relativa entre duas distâncias de superfície (m). */
export function cloudSurfaceDiffers(a: number, b: number): number {
    return Math.abs(a - b) / Math.max(Math.min(a, b), 1);
}

/**
 * O índice do valor exato da mesma superfície de `own`: o do próprio bloco (índice 0) se ele concorda; senão, o dos
 * candidatos (o bloco e os 3 × 3 em volta, `limits[k]`, a superfície até onde cada um foi marchado) mais parecido.
 */
export function cloudFreshForSurface(own: number, limits: readonly number[]): number {
    let pick = 0;
    let best = cloudSurfaceDiffers(limits[0]!, own);
    if (best <= CLOUD_SURFACE_AGREE) return 0;
    limits.forEach((l, k) => {
        const r = cloudSurfaceDiffers(l, own);
        if (r < best) {
            best = r;
            pick = k;
        }
    });
    return pick;
}

const luminance = (c: Rgba): number => rec709([c[0], c[1], c[2]]);

/** Desvios do erro padrão da média dos valores exatos que o gradiente temporal descarta como ruído (R19). */
export const CLOUD_GRADIENT_NOISE = 0.5;

/**
 * O ruído esperado na divergência das médias de `fresh` (uma amostra por bloco): o erro padrão da média da transmitância
 * e, onde ela varia (a borda), o da luz relativa, × `CLOUD_GRADIENT_NOISE`. Espelho de `cloud_gradient_noise`.
 */
export function cloudGradientNoise(fresh: readonly Rgba[]): number {
    const n = fresh.length;
    const lm = fresh.reduce((s, x) => s + luminance(x), 0) / n;
    const am = fresh.reduce((s, x) => s + x[3], 0) / n;
    const sl = Math.sqrt(
        Math.max(fresh.reduce((s, x) => s + luminance(x) ** 2, 0) / n - lm * lm, 0),
    );
    const sa = Math.sqrt(Math.max(fresh.reduce((s, x) => s + x[3] ** 2, 0) / n - am * am, 0));
    return (
        (CLOUD_GRADIENT_NOISE * (sa + ((0.5 * sl) / Math.max(lm, 1e-4)) * Math.min(1, 4 * sa)))
        / Math.sqrt(n)
    );
}

/** Desvios do erro padrão temporal (o segundo momento guardado por pixel) na tolerância (`CLOUD_TEMPORAL_NOISE`). */
export const CLOUD_TEMPORAL_NOISE = 2;

/**
 * O segundo momento temporal guardado num pixel (média exponencial do brilho² e da transmitância² dos valores exatos).
 */
export type Moments = readonly [number, number];

/** O segundo momento de um valor (o brilho² e a transmitância²). */
export function cloudMomentsOf(v: Rgba): Moments {
    return [luminance(v) ** 2, v[3] ** 2];
}

/**
 * O ruído temporal esperado na divergência das médias: o erro padrão da média de uma amostra por bloco, pela variância
 * temporal no pixel marchado de cada um (o segundo momento guardado menos o quadrado do histórico), em unidades de
 * `cloudDivergence`, × `CLOUD_TEMPORAL_NOISE`. Espelho do `temporal_noise` de `cloud_reconstruct_main`.
 */
export function cloudTemporalNoise(
    seen: readonly {
        readonly fresh: Rgba;
        readonly check: Rgba;
        readonly moments?: Moments | undefined;
    }[],
): number {
    const n = seen.length;
    let vl = 0;
    let va = 0;
    for (const x of seen) {
        if (x.moments === undefined) continue;
        vl += Math.max(x.moments[0] - luminance(x.check) ** 2, 0);
        va += Math.max(x.moments[1] - x.check[3] ** 2, 0);
    }
    const lc = seen.reduce((s, x) => s + luminance(x.check), 0) / n;
    const lf = seen.reduce((s, x) => s + luminance(x.fresh), 0) / n;
    return (
        CLOUD_TEMPORAL_NOISE
        * ((0.5 * (Math.sqrt(vl) / n)) / Math.max(Math.max(lc, lf), 1e-4) + Math.sqrt(va) / n)
    );
}

/** Divergência: metade da diferença relativa da luz mais a diferença da transmitância. */
export function cloudDivergence(a: Rgba, b: Rgba): number {
    const la = luminance(a);
    const lb = luminance(b);
    return (Math.abs(la - lb) / Math.max(Math.max(la, lb), 1e-4)) * 0.5 + Math.abs(a[3] - b[3]);
}

/** Entradas de um pixel. */
export interface ReconstructInput {
    /** O pixel é o marchado do bloco neste quadro. */
    readonly marched: boolean;
    /** A série vale (escrita no quadro anterior, sem corte). */
    readonly valid: boolean;
    /** O valor exato do bloco (já o da mesma superfície, `cloudFreshForSurface`). */
    readonly fresh: Rgba;
    /** A superfície do pixel agora e a do histórico dele (m; ausentes: a mesma). */
    readonly surface?: number;
    readonly historySurface?: number;
    /** O histórico reprojetado no pixel (undefined: fora da tela). */
    readonly history: Rgba | undefined;
    /** O histórico reprojetado no pixel marchado do bloco (undefined: fora da tela). */
    readonly check: Rgba | undefined;
    /**
     * Os 3 × 3 blocos em volta (o próprio incluso): o valor exato de cada um e o histórico reprojetado no pixel marchado
     * dele (undefined: fora da tela, fica de fora da média).
     */
    readonly neighbors: readonly {
        readonly fresh: Rgba;
        readonly check: Rgba | undefined;
        /** O segundo momento temporal guardado no pixel marchado dele (ausente: sem). */
        readonly moments?: Moments;
    }[];
    /**
     * Quanto o histórico é recortado pela caixa (0…1, `cloud_reprojection_clip`): o deslocamento da reprojeção entre as
     * profundidades do trecho da nuvem. Ausente: 1 (a câmera que anda).
     */
    readonly clip?: number;
}

const mean = (v: readonly Rgba[]): Rgba =>
    [0, 1, 2, 3].map((c) => v.reduce((s, x) => s + x[c]!, 0) / v.length) as unknown as Rgba;

/** O valor reconstruído do pixel. */
export function reconstructTexel(i: ReconstructInput): Rgba {
    if (!i.valid || i.history === undefined || i.check === undefined) return i.fresh;
    if (
        i.surface !== undefined
        && i.historySurface !== undefined
        && cloudSurfaceDiffers(i.historySurface, i.surface) > CLOUD_SURFACE_AGREE
    )
        return i.fresh;
    const seen = i.neighbors.flatMap((n) =>
        n.check === undefined ? [] : [{ fresh: n.fresh, check: n.check, moments: n.moments }],
    );
    if (seen.length === 0) return i.fresh;
    const divergence = cloudDivergence(
        mean(seen.map((n) => n.check)),
        mean(seen.map((n) => n.fresh)),
    );
    if (
        divergence
        > CLOUD_GRADIENT_TOLERANCE
            + cloudGradientNoise(seen.map((n) => n.fresh))
            + cloudTemporalNoise(seen)
    )
        return i.fresh;
    const box = [i.fresh, ...i.neighbors.map((n) => n.fresh)];
    const clamped = [0, 1, 2, 3].map((c) => {
        const lo = Math.min(...box.map((n) => n[c]!));
        const hi = Math.max(...box.map((n) => n[c]!));
        const pad = CLOUD_BOX_PAD * (hi - lo);
        const h = i.history![c]!;
        return h + (Math.min(hi + pad, Math.max(lo - pad, h)) - h) * (i.clip ?? 1);
    });
    if (!i.marched) return clamped as unknown as Rgba;
    return [0, 1, 2, 3].map(
        (c) => clamped[c]! + (i.fresh[c]! - clamped[c]!) * CLOUD_HISTORY_BLEND,
    ) as unknown as Rgba;
}
