// Referência da reconstrução temporal das nuvens (spec 041, R2; `cloud_reconstruct.wgsl`): por pixel do alvo de ¼, o
// histórico reprojetado (o pixel marchado no quadro mistura o valor do bloco a ele, média exponencial) — salvo quando o
// gradiente temporal filtrado reprova o bloco (a média dos históricos reprojetados nos pixels marchados dos 3 × 3 blocos
// em volta diverge da média dos valores exatos deles além da tolerância: Schied et al. 2018; a lição dos blocos 2 × 2
// da 034), quando o histórico sai da tela ou quando a série não vale (corte, recriação, primeiro quadro): aí, o valor do
// bloco. Sem recorte pela caixa da vizinhança.

import { luminance as rec709 } from '../../../math/reference/color';

export type Rgba = readonly [number, number, number, number];

/** Tolerância do gradiente temporal. */
export const CLOUD_GRADIENT_TOLERANCE = 0.2;
/** Peso do valor novo no pixel marchado (média exponencial sobre o histórico recortado). */
export const CLOUD_HISTORY_BLEND = 0.25;

const luminance = (c: Rgba): number => rec709([c[0], c[1], c[2]]);

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
    /** O valor exato do bloco. */
    readonly fresh: Rgba;
    /** O histórico reprojetado no pixel (undefined: fora da tela). */
    readonly history: Rgba | undefined;
    /** O histórico reprojetado no pixel marchado do bloco (undefined: fora da tela). */
    readonly check: Rgba | undefined;
    /**
     * Os 3 × 3 blocos em volta (o próprio incluso): o valor exato de cada um e o histórico reprojetado no pixel marchado
     * dele (undefined: fora da tela, fica de fora da média).
     */
    readonly neighbors: readonly { readonly fresh: Rgba; readonly check: Rgba | undefined }[];
}

const mean = (v: readonly Rgba[]): Rgba =>
    [0, 1, 2, 3].map((c) => v.reduce((s, x) => s + x[c]!, 0) / v.length) as unknown as Rgba;

/** O valor reconstruído do pixel. */
export function reconstructTexel(i: ReconstructInput): Rgba {
    if (!i.valid || i.history === undefined || i.check === undefined) return i.fresh;
    const seen = i.neighbors.filter((n) => n.check !== undefined);
    if (seen.length === 0) return i.fresh;
    const divergence = cloudDivergence(
        mean(seen.map((n) => n.check!)),
        mean(seen.map((n) => n.fresh)),
    );
    if (divergence > CLOUD_GRADIENT_TOLERANCE) return i.fresh;
    if (!i.marched) return i.history;
    return [0, 1, 2, 3].map(
        (c) => i.history![c]! + (i.fresh[c]! - i.history![c]!) * CLOUD_HISTORY_BLEND,
    ) as unknown as Rgba;
}
