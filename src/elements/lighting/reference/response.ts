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
     * Histerese nos quadros depois de uma luz ou da cena mudar (spec 034, T059; o `ProbeFlow` sabe pelos dados das luzes
     * e pelo envio dos pools): a de resposta a cada quadro da janela, a rápida no valor novo e o ruído recomeçado (o
     * salto não é ruído); no fim, a rampa e a contagem como depois de uma mudança detectada.
     */
    changed: 0.3,
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
     * Fração do ruído anterior que a estimativa guarda a cada quadro (spec 034, T059): o ruído sobe logo e desce devagar.
     * Com poucos raios numa fonte pequena, os valores são quase sempre baixos e às vezes muito altos; a média de 10
     * quadros esquecia o pico entre um e outro e o pico seguinte parecia mudança — a sonda recomeçava e piscava. Nas
     * sondas de tela (≈ 16 quadros); nas do mundo e nas células do cache de irradiância, 0 (sem retenção).
     */
    holdScreen: 0.94,
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
    options: { readonly hold?: number; readonly changed?: boolean } = {},
): { readonly h: number; readonly transient: boolean; readonly state: ResponseState } {
    if (state.frames === 0)
        return { h: 0, transient: false, state: { fast: x, mean: x, noise: 0, frames: 1 } };
    if (options.changed === true) {
        const h = GI_RESPONSE.changed;
        return {
            h,
            transient: true,
            state: { fast: x, mean: x + (state.mean - x) * h, noise: 0, frames: -GI_RESPONSE.ramp },
        };
    }
    const F = GI_RESPONSE.fast;
    const fast = x + (state.fast - x) * F;
    const d = state.fast > 1e-6 ? x / state.fast - 1 : 0;
    const noise = Math.max(
        d * d + (state.noise - d * d) * GI_RESPONSE.noise,
        state.noise * (options.hold ?? 0),
    );
    const scale = Math.max(fast, state.mean);
    const sigmaFast = Math.sqrt(state.noise * ((1 - F) / (1 + F)));
    const transient =
        Math.abs(fast - state.mean)
        > (GI_RESPONSE.sigmas * sigmaFast + GI_RESPONSE.relative) * scale;
    // Na mudança, `ramp` quadros com a histerese de resposta (quadros negativos contam os que faltam) e depois a
    // contagem segue de `ramp`.
    const R = GI_RESPONSE.ramp;
    let h = Math.min(
        state.frames / (state.frames + 1),
        varianceHysteresis(state.noise, hysteresis),
    );
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
