// Referência de CPU da histerese adaptativa das sondas (spec 033, R5, US4) — a mesma regra de `gi_response.wgsl`. Cada
// sonda guarda duas médias de um valor da sua luz (o maior canal da radiância: uma mudança de cor aparece nele) — rápida,
// de poucos quadros, e lenta, a do acúmulo — e o ruído dos raios. Quando a rápida se afasta da lenta mais do que o ruído explica, a luz mudou de verdade (uma
// luz acendeu, a geometria mudou): a histerese cai para a de resposta e o acúmulo alcança o valor novo em poucos
// quadros; parado, volta à histerese do acúmulo. O ruído sozinho não dispara (o limiar é em desvios da média rápida).

/** Constantes da resposta (as mesmas do WGSL). */
export const GI_RESPONSE = Object.freeze({
    /** Peso do valor anterior na média rápida (≈ 4 quadros). */
    fast: 0.75,
    /** Histerese durante a mudança: o acúmulo alcança o valor novo em poucos quadros. */
    hysteresis: 0.3,
    /** Desvios da média rápida acima dos quais a diferença é mudança, não ruído. */
    sigmas: 2.5,
    /** Parte relativa do limiar (mudanças menores que isso não aceleram o acúmulo). */
    relative: 0.05,
    /** Peso do valor anterior na estimativa do ruído (≈ 10 quadros). */
    noise: 0.9,
    /**
     * Quadros com a histerese de resposta depois de uma mudança, antes de a contagem seguir (os rebatimentos encadeados
     * atrasam um quadro por geração: a média igual dos primeiros valores guardaria o resíduo do estado anterior).
     */
    ramp: 3,
});

/** Estado da resposta de uma sonda. */
export interface ResponseState {
    /** Média rápida do valor. */
    readonly fast: number;
    /** Média lenta (a do acúmulo). */
    readonly mean: number;
    /** Variância relativa do valor em torno da média rápida (o ruído dos raios). */
    readonly noise: number;
    /** Quadros acumulados desde o último recomeço (0 = recomeça; negativo = os quadros de resposta que faltam). */
    readonly frames: number;
}

/** Estado vazio (a sonda recomeça). */
export const RESPONSE_EMPTY: ResponseState = Object.freeze({
    fast: 0,
    mean: 0,
    noise: 0,
    frames: 0,
});

/**
 * Um quadro da resposta com o valor novo `x` e a histerese do acúmulo `hysteresis`: a histerese a usar no quadro
 * (0 ao recomeçar) e o estado seguinte. Na mudança, a histerese do quadro é a de resposta e a contagem recomeça (as
 * seguintes são 1/2, 2/3, …: a média só dos valores novos). O ruído é o desvio relativo à média rápida, que acompanha
 * um salto em poucos quadros (o salto só o infla por pouco tempo).
 */
export function adaptiveHysteresis(
    state: ResponseState,
    x: number,
    hysteresis: number,
): { readonly h: number; readonly transient: boolean; readonly state: ResponseState } {
    if (state.frames === 0)
        return { h: 0, transient: false, state: { fast: x, mean: x, noise: 0, frames: 1 } };
    const F = GI_RESPONSE.fast;
    const fast = x + (state.fast - x) * F;
    const d = state.fast > 1e-6 ? x / state.fast - 1 : 0;
    const noise = d * d + (state.noise - d * d) * GI_RESPONSE.noise;
    const scale = Math.max(fast, state.mean);
    const sigmaFast = Math.sqrt(state.noise * ((1 - F) / (1 + F)));
    const transient =
        Math.abs(fast - state.mean)
        > (GI_RESPONSE.sigmas * sigmaFast + GI_RESPONSE.relative) * scale;
    // Na mudança, `ramp` quadros com a histerese de resposta (quadros negativos contam os que faltam) e depois a
    // contagem segue de `ramp`.
    const R = GI_RESPONSE.ramp;
    let h = Math.min(state.frames / (state.frames + 1), hysteresis);
    let frames = state.frames + 1;
    if (transient) {
        h = GI_RESPONSE.hysteresis;
        frames = -R;
    } else if (state.frames < 0) {
        h = GI_RESPONSE.hysteresis;
        frames = state.frames + 1 === 0 ? R : state.frames + 1;
    }
    return { h, transient, state: { fast, mean: x + (state.mean - x) * h, noise, frames } };
}
