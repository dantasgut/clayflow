// Referência de CPU da histerese adaptativa das sondas (spec 033, R5, US4) — a mesma regra de `gi_response.wgsl`. Cada
// sonda guarda duas médias de um valor da sua luz (o maior canal da radiância: uma mudança de cor aparece nele) — rápida,
// de poucos quadros, e lenta, a do acúmulo — e o ruído dos raios. Quando a rápida se afasta da lenta mais do que o ruído explica, a luz mudou de verdade (uma
// luz acendeu, a geometria mudou): a histerese cai para a de resposta e o acúmulo alcança o valor novo em poucos
// quadros; parado, volta à histerese do acúmulo. O ruído sozinho não dispara (o limiar é em desvios da média rápida).

/** Constantes da resposta (as mesmas do WGSL). */
export const GI_RESPONSE = Object.freeze({
    /** Peso do valor anterior na média rápida (≈ 3 quadros). */
    fast: 0.65,
    /** Histerese durante a mudança: o acúmulo alcança o valor novo em poucos quadros. */
    hysteresis: 0.3,
    /**
     * Desvios da média rápida acima dos quais a diferença é mudança, não ruído. 4σ (spec 034, T052) perdia a luz que
     * acende numa cena escura: perto de zero o ruído relativo estimado explode e o limiar passa da mudança.
     */
    sigmas: 2.5,
    /**
     * Parte relativa do limiar (mudanças menores que isso não aceleram o acúmulo). 3 %: o reflexo de cor que some num
     * chão iluminado direto pelo sol muda pouco o maior canal (com 5 % o chão ficava na histerese do acúmulo).
     */
    relative: 0.03,
    /** Peso do valor anterior na estimativa do ruído (≈ 10 quadros). */
    noise: 0.9,

    /**
     * Quadros com a histerese de resposta depois de uma mudança, antes de a contagem seguir (os rebatimentos encadeados
     * atrasam um quadro por geração: a média igual dos primeiros valores guardaria o resíduo do estado anterior).
     */
    ramp: 3,
    /** Teto da histerese do acúmulo pela variância (spec 034, T052). */
    ceiling: 0.995,
    /** Ruído relativo alvo da média acumulada: a histerese pela variância é a que chega nele. */
    target: 0.005,
});

/**
 * A histerese do acúmulo parado pela variância relativa `noise` dos valores (spec 034, T052): a que deixa o ruído da
 * média acumulada, σ √((1 − h)/(1 + h)), no alvo — (σ² − τ²)/(σ² + τ²) —, entre `floor` (a da autoria) e o teto.
 */
export function varianceHysteresis(noise: number, floor: number): number {
    const t2 = GI_RESPONSE.target * GI_RESPONSE.target;
    return Math.min(
        Math.max((noise - t2) / (noise + t2), floor),
        Math.max(floor, GI_RESPONSE.ceiling),
    );
}

/** Estado da resposta de uma sonda. */
export interface ResponseState {
    /** Média rápida do valor. */
    readonly fast: number;
    /** Média lenta (a do acúmulo). */
    readonly mean: number;
    /** Variância relativa do valor em torno da média rápida (o ruído dos raios). */
    readonly noise: number;
    /**
     * Quadros acumulados desde o último recomeço (0 = recomeça; negativo = os quadros de resposta que faltam; com meio
     * quadro a mais, a mudança pendente de confirmação).
     */
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
    // A contagem (o meio quadro marca a mudança pendente: a rápida se afastou da lenta no quadro anterior).
    const pending = state.frames > 0 && state.frames % 1 !== 0;
    const count = pending ? state.frames - 0.5 : state.frames;
    const exceed =
        Math.abs(fast - state.mean)
        > (GI_RESPONSE.sigmas * sigmaFast + GI_RESPONSE.relative) * scale;
    // A mudança se confirma no quadro seguinte (spec 034, T059): o valor novo fica mais perto do valor que afastou a
    // rápida (o do quadro anterior, tirado da rápida com a anterior a ele na lenta) que da lenta. Com poucos raios numa
    // fonte pequena (a mancha de sol da caixa de Cornell), os valores são quase sempre baixos e às vezes muito altos; o
    // pico puxava a rápida para longe da lenta, a sonda recomeçava e piscava (`giNoise`, Cornell média: cintilação de
    // 1,1 % para 0,3 % sem os disparos falsos). No pico, o valor seguinte volta para a lenta; na luz que acende ou apaga,
    // fica no novo. A sonda calma (ruído abaixo da parte relativa do limiar) não espera: nela não há pico a temer.
    const previous = (state.fast - F * state.mean) / (1 - F);
    const confirmed = Math.abs(x - previous) < Math.abs(x - state.mean);
    const calm = state.noise < GI_RESPONSE.relative * GI_RESPONSE.relative;
    const transient = count > 0 && ((exceed && calm) || (pending && confirmed));
    // Na mudança, `ramp` quadros com a histerese de resposta (quadros negativos contam os que faltam) e depois a
    // contagem segue de `ramp`. A mudança recomeça a rápida no valor novo e o ruído (o salto não é ruído): os
    // rebatimentos encadeados — as sondas que leem o cache, o cache que lê a si mesmo — ainda sobem alguns quadros
    // depois, e com o ruído do salto o limiar ficava alto, a lenta seguia pela média de todos os quadros desde a mudança
    // e levava segundos para chegar; com o ruído recomeçado, cada degrau dos rebatimentos é outra mudança.
    const R = GI_RESPONSE.ramp;
    if (transient) {
        const h = GI_RESPONSE.hysteresis;
        return {
            h,
            transient,
            state: { fast: x, mean: x + (state.mean - x) * h, noise: 0, frames: -R },
        };
    }
    let h = Math.min(count / (count + 1), varianceHysteresis(state.noise, hysteresis));
    let frames = count + 1 + (count > 0 && exceed ? 0.5 : 0);
    if (count < 0) {
        h = GI_RESPONSE.hysteresis;
        frames = count + 1 === 0 ? R : count + 1;
    }
    return { h, transient, state: { fast, mean: x + (state.mean - x) * h, noise, frames } };
}
