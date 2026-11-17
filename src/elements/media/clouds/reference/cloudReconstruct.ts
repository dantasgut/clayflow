// Referência da reconstrução temporal das nuvens (spec 041, R2; `cloud_reconstruct.wgsl`): por pixel do alvo de ¼, o
// valor do bloco misturado ao histórico recortado (o pixel marchado no quadro, média exponencial), ou o histórico reprojetado recortado pela caixa dos valores exatos
// dos 3 × 3 blocos em volta — salvo quando o gradiente temporal reprova o bloco (no pixel marchado, o histórico
// reprojetado diverge do valor exato além da tolerância: a lição dos blocos 2 × 2 da 034), quando o histórico sai da
// tela ou quando a série não vale (corte, recriação, primeiro quadro).

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
    /** Os valores exatos dos 3 × 3 blocos em volta (o próprio incluso). */
    readonly neighbors: readonly Rgba[];
}

/** O valor reconstruído do pixel. */
export function reconstructTexel(i: ReconstructInput): Rgba {
    if (i.marched || !i.valid || i.history === undefined || i.check === undefined) return i.fresh;
    if (cloudDivergence(i.check, i.fresh) > CLOUD_GRADIENT_TOLERANCE) return i.fresh;
    const lo = [0, 1, 2, 3].map((c) => Math.min(...i.neighbors.map((n) => n[c]!), i.fresh[c]!));
    const hi = [0, 1, 2, 3].map((c) => Math.max(...i.neighbors.map((n) => n[c]!), i.fresh[c]!));
    return [0, 1, 2, 3].map((c) =>
        Math.min(hi[c]!, Math.max(lo[c]!, i.history![c]!)),
    ) as unknown as Rgba;
}
