// Referência de CPU da histerese adaptativa das sondas (spec 033, R5, US4) — a mesma regra de `gi_response.wgsl`. Cada
// sonda guarda duas médias da sua luminância (rápida, de poucos quadros, e lenta, a do acúmulo) e o segundo momento da
// lenta (o ruído dos raios). Quando a rápida se afasta da lenta mais do que o ruído explica, a luz mudou de verdade (uma
// luz acendeu, a geometria mudou): a histerese cai para a de resposta e o acúmulo alcança o valor novo em poucos
// quadros; parado, volta à histerese do acúmulo. O ruído sozinho não dispara (o limiar é em desvios da média rápida).

/** Constantes da resposta (as mesmas do WGSL). */
export const GI_RESPONSE = Object.freeze({
    /** Peso do valor anterior na média rápida (≈ 4 quadros). */
    fast: 0.75,
    /** Histerese durante a mudança: o acúmulo alcança o valor novo em poucos quadros. */
    hysteresis: 0.3,
    /** Desvios da média rápida acima dos quais a diferença é mudança, não ruído. */
    sigmas: 3,
    /** Parte relativa do limiar (mudanças menores que isso não aceleram o acúmulo). */
    relative: 0.05,
    /** Peso do valor anterior na estimativa do ruído (≈ 10 quadros). */
    noise: 0.9,
});

/** Estado da resposta de uma sonda. */
export interface ResponseState {
    /** Média rápida da luminância. */
    readonly fast: number;
    /** Média lenta (a do acúmulo). */
    readonly mean: number;
    /** Variância relativa da luminância em torno da média rápida (o ruído dos raios). */
    readonly noise: number;
    /** Quadros acumulados desde o último recomeço (0 = recomeça). */
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
 * Um quadro da resposta com a luminância nova `x` e a histerese do acúmulo `hysteresis`: a histerese a usar no quadro
 * (0 ao recomeçar) e o estado seguinte. Na mudança, a histerese do quadro é a de resposta e a contagem recomeça (as
 * seguintes são 1/2, 2/3, …: a média só dos valores novos). O ruído é o desvio relativo à média rápida, que acompanha
 * um salto em poucos quadros (o salto só o infla por pouco tempo).
 */
export function adaptiveHysteresis(
    state: ResponseState,
    x: number,
    hysteresis: number,
): { readonly h: number; readonly transient: boolean; readonly state: ResponseState } {
    if (state.frames <= 0)
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
    const h = transient
        ? GI_RESPONSE.hysteresis
        : Math.min(state.frames / (state.frames + 1), hysteresis);
    return {
        h,
        transient,
        state: {
            fast,
            mean: x + (state.mean - x) * h,
            noise,
            frames: transient ? 1 : state.frames + 1,
        },
    };
}
