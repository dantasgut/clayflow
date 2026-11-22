// Referência da reconstrução temporal das nuvens (spec 041, R2; `cloud_reconstruct.wgsl`): por pixel do alvo de ¼, o
// histórico reprojetado (o pixel marchado no quadro mistura o valor do bloco a ele, média exponencial) — salvo quando o
// gradiente temporal filtrado reprova o bloco (a média dos históricos reprojetados nos pixels marchados dos 3 × 3 blocos
// em volta diverge da média dos valores exatos deles além da tolerância mais o ruído esperado da média — o erro padrão
// das amostras, R19: Schied et al. 2018; a lição dos blocos 2 × 2
// da 034; em rampa, `cloudHistoryReset`), quando o histórico sai da tela ou quando a série não vale (corte, recriação,
// primeiro quadro): aí, o valor exato interpolado no lugar do pixel entre os marchados dos blocos vizinhos
// (`cloudFreshAt`), não o do pixel marchado do bloco copiado nos quatro (o mosaico de blocos de 2·S px com uma amostra
// cada nas nuvens escuras do pôr do sol). O histórico é recortado pela caixa dos valores exatos dos 3 × 3 blocos, com folga de metade da largura, na
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
 * O ruído esperado na divergência das médias de `fresh` (uma amostra por bloco, pesos `weights` da janela): o erro padrão
 * da média ponderada (com o número efetivo de amostras, `(Σw)²/Σw²`) da transmitância e, onde ela varia (a borda), o da
 * luz relativa, × `CLOUD_GRADIENT_NOISE`. Espelho de `cloud_gradient_noise`.
 */
export function cloudGradientNoise(
    fresh: readonly Rgba[],
    weights: readonly number[] = fresh.map(() => 1),
): number {
    const w = weights.reduce((s, x) => s + x, 0);
    const n = w ** 2 / weights.reduce((s, x) => s + x * x, 0);
    const lm = fresh.reduce((s, x, k) => s + luminance(x) * weights[k]!, 0) / w;
    const am = fresh.reduce((s, x, k) => s + x[3] * weights[k]!, 0) / w;
    const sl = Math.sqrt(
        Math.max(
            fresh.reduce((s, x, k) => s + luminance(x) ** 2 * weights[k]!, 0) / w - lm * lm,
            0,
        ),
    );
    const sa = Math.sqrt(
        Math.max(fresh.reduce((s, x, k) => s + x[3] ** 2 * weights[k]!, 0) / w - am * am, 0),
    );
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
        readonly weight?: number | undefined;
    }[],
): number {
    let vl = 0;
    let va = 0;
    let w = 0;
    let lc = 0;
    let lf = 0;
    for (const x of seen) {
        const k = x.weight ?? 1;
        w += k;
        lc += luminance(x.check) * k;
        lf += luminance(x.fresh) * k;
        if (x.moments === undefined) continue;
        vl += Math.max(x.moments[0] - luminance(x.check) ** 2, 0) * k * k;
        va += Math.max(x.moments[1] - x.check[3] ** 2, 0) * k * k;
    }
    return (
        CLOUD_TEMPORAL_NOISE
        * ((0.5 * (Math.sqrt(vl) / w)) / Math.max(Math.max(lc / w, lf / w), 1e-4)
            + Math.sqrt(va) / w)
    );
}

/**
 * Peso de um bloco na janela do gradiente temporal de um texel (espelho do laço de `cloud_reconstruct_main`): `o` o
 * deslocamento do bloco (−1…2) a partir do bloco do marchado à esquerda/acima do texel e `f` a fração do texel na grade
 * dos marchados (0 no marchado, ½ entre dois); o produto de `max(2 − |o − f|, 0)` nos dois eixos — [1, 2, 1] no
 * marchado, [1, 3, 3, 1] entre dois. A janela anda com o texel (contínua de um texel ao vizinho, sem degrau na borda do
 * bloco) e a resposta em frequência dela não é negativa em nenhuma: o seguimento do histórico (`cloudHistoryFollow`)
 * amortece todo modo do erro entre os blocos. Na média 3 × 3 de pesos iguais a resposta na frequência de Nyquist é −⅓
 * num eixo: a faixa de blocos alternados se amplificava a cada quadro (o degrau de 6–9 × na borda dos blocos).
 */
export function cloudGradientWeight(
    o: readonly [number, number],
    f: readonly [number, number],
): number {
    return Math.max(2 - Math.abs(o[0] - f[0]), 0) * Math.max(2 - Math.abs(o[1] - f[1]), 0);
}

/**
 * Quanto do desvio medido entre as médias dos valores exatos e dos históricos nos marchados da janela o histórico de
 * todos os texels segue no quadro, sem ruído (`CLOUD_HISTORY_FOLLOW`). Um texel do bloco 2 × 2 é marchado a cada quatro
 * quadros: com a luz mudando (o sol que anda), os quatro ficavam com idades de 0 a 3 quadros na média exponencial — a
 * grade de 2·S pixels — e o histórico ~13 quadros atrás da luz. Seguindo ½, ~1 quadro atrás e as idades a ~0,2 quadro
 * de mudança uma da outra.
 */
export const CLOUD_HISTORY_FOLLOW = 0.5;

/**
 * A mudança relativa da luz por quadro que o seguimento espera (`CLOUD_FOLLOW_CHANGE`, τ): o ganho é `β·τ²/(τ² + σ²)`,
 * `σ` o erro padrão relativo da média dos valores exatos da janela — onde o ruído de uma amostra domina (a faixa clara
 * de 1–2 px rente ao horizonte), o histórico não segue o ruído.
 */
export const CLOUD_FOLLOW_CHANGE = 0.1;

/**
 * O fator de cada canal da luz que o histórico segue (espelho de `cloud_history_follow`): `1 + g·(F − C)/D`, `F` e `C`
 * as médias ponderadas dos valores exatos e dos históricos nos marchados, `g = β·τ²/(τ² + σ²)` (`noise` = σ) e o
 * denominador `D = C + (α/2)(F − C)`, sem viés pelo ruído: na razão `F/C` o histórico ruidoso no denominador puxava o
 * fator para cima (`E[1/C] > 1/E[C]`); com o peso α/2 do valor exato, os termos de segunda ordem de `F` e de `C` se
 * cancelam (a variância do histórico na média exponencial é α/(2 − α) da de uma amostra). Sem limite que corte só um
 * lado (a cauda de cima cortada puxava a luz para baixo); nunca negativo.
 */
export function cloudHistoryFollow(
    freshMean: Rgba,
    checkMean: Rgba,
    noise = 0,
    follow = CLOUD_HISTORY_FOLLOW,
): [number, number, number] {
    const eps = 1e-3 * Math.max(luminance(checkMean), 1e-6) + 1e-9;
    const tau2 = CLOUD_FOLLOW_CHANGE ** 2;
    const gain = (follow * tau2) / (tau2 + noise * noise);
    return [0, 1, 2].map((c) => {
        const f = freshMean[c]!;
        const h = checkMean[c]!;
        const d = h + 0.5 * CLOUD_HISTORY_BLEND * (f - h) + eps;
        return Math.max(0, 1 + (gain * (f - h)) / d);
    }) as [number, number, number];
}

/** Divergência: metade da diferença relativa da luz mais a diferença da transmitância. */
export function cloudDivergence(a: Rgba, b: Rgba): number {
    const la = luminance(a);
    const lb = luminance(b);
    return (Math.abs(la - lb) / Math.max(Math.max(la, lb), 1e-4)) * 0.5 + Math.abs(a[3] - b[3]);
}

/**
 * O valor exato no pixel pela interpolação bilinear dos pixels marchados dos blocos vizinhos (a grade regular de passo 2
 * pixels de ¼): `f` a fração do pixel nessa grade (0 no marchado do bloco, ½ entre dois), `samples` os quatro marchados
 * em volta na ordem (0, 0), (1, 0), (0, 1), (1, 1) com a superfície até onde cada um foi; só os da superfície `own` contam.
 * Sem nenhum, `fallback`. Espelho de `cloud_fresh_at`.
 */
export function cloudFreshAt(
    f: readonly [number, number],
    samples: readonly { readonly value: Rgba; readonly surface: number }[],
    own: number,
    fallback: Rgba,
): Rgba {
    const sum = [0, 0, 0, 0];
    let weight = 0;
    samples.forEach((s, k) => {
        const ox = k & 1;
        const oy = k >> 1;
        const bil = (ox === 1 ? f[0] : 1 - f[0]) * (oy === 1 ? f[1] : 1 - f[1]);
        if (bil <= 0 || cloudSurfaceDiffers(s.surface, own) > CLOUD_SURFACE_AGREE) return;
        for (let c = 0; c < 4; c++) sum[c]! += s.value[c]! * bil;
        weight += bil;
    });
    if (weight < 1e-3) return fallback;
    return sum.map((v) => v / weight) as unknown as Rgba;
}

/**
 * Quanto o bloco larga o histórico (0…1) pela divergência `d` e a tolerância `allowance`: nada até ela, tudo a 1,5 × ela.
 * Espelho de `cloud_history_reset`.
 */
export function cloudHistoryReset(d: number, allowance: number): number {
    return Math.min(1, Math.max(0, 2 * (d / Math.max(allowance, 1e-6) - 1)));
}

/** Entradas de um pixel. */
export interface ReconstructInput {
    /** O pixel é o marchado do bloco neste quadro. */
    readonly marched: boolean;
    /** A série vale (escrita no quadro anterior, sem corte). */
    readonly valid: boolean;
    /** O valor exato do bloco (já o da mesma superfície, `cloudFreshForSurface`). */
    readonly fresh: Rgba;
    /** O valor exato interpolado no lugar do pixel (`cloudFreshAt`; no marchado, o dele). Ausente: `fresh`. */
    readonly here?: Rgba;
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
        /** O peso na janela do gradiente (`cloudGradientWeight`; ausente: 1). */
        readonly weight?: number;
    }[];
    /**
     * Os valores exatos da caixa do recorte (os 3 × 3 blocos em volta do bloco do texel). Ausente: os de `neighbors`.
     */
    readonly box?: readonly Rgba[];
    /** Quanto o histórico segue o desvio medido (`CLOUD_HISTORY_FOLLOW` se ausente). */
    readonly follow?: number;
    /**
     * Quanto o histórico é recortado pela caixa (0…1, `cloud_reprojection_clip`): o deslocamento da reprojeção entre as
     * profundidades do trecho da nuvem. Ausente: 1 (a câmera que anda).
     */
    readonly clip?: number;
}

/** O valor reconstruído do pixel. */
export function reconstructTexel(i: ReconstructInput): Rgba {
    const here = i.here ?? i.fresh;
    if (!i.valid || i.history === undefined || i.check === undefined) return here;
    if (
        i.surface !== undefined
        && i.historySurface !== undefined
        && cloudSurfaceDiffers(i.historySurface, i.surface) > CLOUD_SURFACE_AGREE
    )
        return here;
    const seen = i.neighbors.flatMap((n) =>
        n.check === undefined
            ? []
            : [{ fresh: n.fresh, check: n.check, moments: n.moments, weight: n.weight ?? 1 }],
    );
    if (seen.length === 0) return here;
    const weights = seen.map((n) => n.weight);
    const w = weights.reduce((s, x) => s + x, 0);
    const wmean = (v: readonly Rgba[]): Rgba =>
        [0, 1, 2, 3].map(
            (c) => v.reduce((s, x, k) => s + x[c]! * weights[k]!, 0) / w,
        ) as unknown as Rgba;
    const freshMean = wmean(seen.map((n) => n.fresh));
    const checkMean = wmean(seen.map((n) => n.check));
    const divergence = cloudDivergence(checkMean, freshMean);
    const reset = cloudHistoryReset(
        divergence,
        CLOUD_GRADIENT_TOLERANCE
            + cloudGradientNoise(
                seen.map((n) => n.fresh),
                weights,
            )
            + cloudTemporalNoise(seen),
    );
    // O erro padrão relativo da média do brilho na janela, pela variância temporal guardada (× w²).
    let vl = 0;
    for (const x of seen)
        if (x.moments !== undefined)
            vl += Math.max(x.moments[0] - luminance(x.check) ** 2, 0) * x.weight ** 2;
    const relative =
        Math.sqrt(vl) / w / Math.max(Math.max(luminance(checkMean), luminance(freshMean)), 1e-4);
    const follow = cloudHistoryFollow(freshMean, checkMean, relative, i.follow);
    const history = [0, 1, 2, 3].map((c) => i.history![c]! * (c < 3 ? follow[c]! : 1));
    const box = [i.fresh, ...(i.box ?? i.neighbors.map((n) => n.fresh))];
    const lo = [0, 1, 2, 3].map((c) => Math.min(...box.map((n) => n[c]!)));
    const hi = [0, 1, 2, 3].map((c) => Math.max(...box.map((n) => n[c]!)));
    const kept = [0, 1, 2, 3].map((c) => {
        const pad = CLOUD_BOX_PAD * (hi[c]! - lo[c]!);
        const h = history[c]!;
        return (
            h
            + (Math.min(hi[c]! + pad, Math.max(lo[c]! - pad, h)) - h) * Math.max(i.clip ?? 1, reset)
        );
    });
    const step = i.marched ? kept.map((k, c) => k + (i.fresh[c]! - k) * CLOUD_HISTORY_BLEND) : kept;
    return step.map((v, c) => v * (1 - reset) + here[c]! * reset) as unknown as Rgba;
}
