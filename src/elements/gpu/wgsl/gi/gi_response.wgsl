// Histerese adaptativa das sondas (spec 033, R5, US4) — a regra de `reference/response.ts`. Estado por sonda: média
// rápida e lenta do maior canal da radiância, ruído (variância relativa à rápida, que sobe logo e desce devagar) e
// quadros desde o último recomeço. Quando a rápida se afasta da lenta mais do que o ruído explica, a luz mudou de verdade:
// alguns quadros com a histerese de resposta (o estado anterior some exponencialmente) e depois a contagem segue;
// parado, a histerese do acúmulo — pela variância (T052): a que leva o ruído da média acumulada ao alvo, entre a da
// autoria (o piso) e 0,995. Depois de uma luz ou da cena mudar (o `ProbeFlow` sabe), a mudança vale sem detecção.

const GI_RESPONSE_FAST: f32 = 0.65;
const GI_RESPONSE_HYSTERESIS: f32 = 0.3;
/**
 * Histerese nos quadros depois de uma luz ou da cena mudar (spec 034, T059): a de resposta a cada quadro da janela, a
 * rápida no valor novo e o ruído recomeçado (o salto não é ruído); no fim, a rampa e a contagem como depois de uma
 * mudança detectada.
 */
const GI_RESPONSE_CHANGED: f32 = 0.3;
const GI_RESPONSE_SIGMAS: f32 = 2.5;
const GI_RESPONSE_RELATIVE: f32 = 0.03;
const GI_RESPONSE_NOISE: f32 = 0.9;
/**
 * Fração do ruído anterior que a estimativa guarda a cada quadro (spec 034, T059): o ruído sobe logo e desce devagar.
 * Com poucos raios numa fonte pequena (a mancha de sol da caixa de Cornell), os valores são quase sempre baixos e às
 * vezes muito altos; a média de 10 quadros esquecia o pico entre um e outro, o pico seguinte parecia mudança e a sonda
 * recomeçava — manchas que piscavam (`giNoise`, Cornell média: cintilação de 1,1 % para 0,4 %). Nas sondas de tela
 * (≈ 16 quadros); as do mundo, com muitos raios, e as células do cache, de memória curta, sem.
 */
const GI_RESPONSE_HOLD_SCREEN: f32 = 0.94;
const GI_RESPONSE_RAMP: f32 = 3.0;
const GI_RESPONSE_CEILING: f32 = 0.995;
const GI_RESPONSE_TARGET: f32 = 0.005;

/**
 * A histerese do acúmulo parado pela variância relativa `noise` dos valores: a que deixa o ruído da média acumulada,
 * σ √((1 − h)/(1 + h)), no alvo — (σ² − τ²)/(σ² + τ²) —, entre `floor` (a da autoria) e o teto.
 */
fn gi_response_cap(noise: f32, floor: f32) -> f32 {
    let t2 = GI_RESPONSE_TARGET * GI_RESPONSE_TARGET;
    return clamp((noise - t2) / (noise + t2), floor, max(floor, GI_RESPONSE_CEILING));
}

/** Um quadro da resposta: a histerese do quadro e o estado seguinte (rápida, lenta, ruído, quadros). */
struct GiResponse {
    h: f32,
    state: vec4f,
}

/**
 * A histerese do quadro para a luminância nova `x` (0 ao recomeçar: `state.w` = 0), com a retenção `hold` do ruído.
 * `changed`: uma luz ou a cena mudou há poucos quadros (o `ProbeFlow` sabe pelos dados das luzes e pelo envio dos pools,
 * spec 034 T059) — a mudança vale sem esperar a sonda a detectar: a de ruído alto (poucos raios, uma fonte pequena) não
 * a distingue do ruído, e o cache e as sondas que leem dele levavam segundos para chegar.
 */
fn gi_response(state: vec4f, x: f32, hysteresis: f32, changed: bool, hold: f32) -> GiResponse {
    if (state.w == 0.0) { return GiResponse(0.0, vec4f(x, x, 0.0, 1.0)); }
    if (changed) {
        return GiResponse(GI_RESPONSE_CHANGED, vec4f(x, mix(x, state.y, GI_RESPONSE_CHANGED), 0.0, -GI_RESPONSE_RAMP));
    }
    let fast = mix(x, state.x, GI_RESPONSE_FAST);
    let d = select(0.0, x / state.x - 1.0, state.x > 1e-6);
    // O ruído sobe logo e desce devagar (spec 034, T059): com poucos raios numa fonte pequena os valores são quase sempre
    // baixos e às vezes muito altos; a média de 10 quadros esquecia o pico entre um e outro e o pico seguinte parecia
    // mudança — a sonda recomeçava e piscava.
    let noise = max(mix(d * d, state.z, GI_RESPONSE_NOISE), state.z * hold);
    let scale = max(fast, state.y);
    let sigma_fast = sqrt(state.z * ((1.0 - GI_RESPONSE_FAST) / (1.0 + GI_RESPONSE_FAST)));
    let transient = abs(fast - state.y) > (GI_RESPONSE_SIGMAS * sigma_fast + GI_RESPONSE_RELATIVE) * scale;
    // Na mudança, `GI_RESPONSE_RAMP` quadros com a histerese de resposta (quadros negativos contam os que faltam) e
    // depois a contagem segue de `GI_RESPONSE_RAMP`.
    var h = min(state.w / (state.w + 1.0), gi_response_cap(state.z, hysteresis));
    var frames = state.w + 1.0;
    if (transient) {
        h = GI_RESPONSE_HYSTERESIS;
        frames = -GI_RESPONSE_RAMP;
    } else if (state.w < 0.0) {
        h = GI_RESPONSE_HYSTERESIS;
        frames = select(state.w + 1.0, GI_RESPONSE_RAMP, state.w + 1.0 == 0.0);
    }
    return GiResponse(h, vec4f(fast, mix(x, state.y, h), noise, frames));
}

/**
 * O valor que a resposta acompanha numa radiância: o maior canal (uma mudança de cor — o reflexo vermelho que some —
 * aparece nele, enquanto a luminância quase não muda).
 */
fn gi_response_value(c: vec3f) -> f32 {
    return max_channel(c);
}
