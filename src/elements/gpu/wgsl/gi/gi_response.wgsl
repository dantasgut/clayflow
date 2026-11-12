// Histerese adaptativa das sondas (spec 033, R5, US4) — a regra de `reference/response.ts`. Estado por sonda: média
// rápida e lenta do maior canal da radiância, ruído (variância relativa à rápida) e quadros desde o último recomeço (meio
// quadro a mais: a mudança pendente). Quando a rápida se afasta da lenta mais do que o ruído explica e o valor seguinte
// confirma, a luz mudou de verdade: alguns quadros com a histerese de resposta (o estado anterior some
// exponencialmente) e depois a contagem segue; parado, a histerese do acúmulo — pela variância (T052): a que leva o
// ruído da média acumulada ao alvo, entre a da autoria (o piso) e 0,995.

const GI_RESPONSE_FAST: f32 = 0.65;
const GI_RESPONSE_HYSTERESIS: f32 = 0.3;
const GI_RESPONSE_SIGMAS: f32 = 2.5;
const GI_RESPONSE_RELATIVE: f32 = 0.03;
const GI_RESPONSE_NOISE: f32 = 0.9;
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

/** A histerese do quadro para a luminância nova `x` (0 ao recomeçar: `state.w` = 0). */
fn gi_response(state: vec4f, x: f32, hysteresis: f32) -> GiResponse {
    if (state.w == 0.0) { return GiResponse(0.0, vec4f(x, x, 0.0, 1.0)); }
    let fast = mix(x, state.x, GI_RESPONSE_FAST);
    let d = select(0.0, x / state.x - 1.0, state.x > 1e-6);
    let noise = mix(d * d, state.z, GI_RESPONSE_NOISE);
    let scale = max(fast, state.y);
    let sigma_fast = sqrt(state.z * ((1.0 - GI_RESPONSE_FAST) / (1.0 + GI_RESPONSE_FAST)));
    // A contagem (o meio quadro marca a mudança pendente: a rápida se afastou da lenta no quadro anterior).
    let pending = state.w > 0.0 && fract(state.w) != 0.0;
    let count = select(state.w, state.w - 0.5, pending);
    let exceed = abs(fast - state.y) > (GI_RESPONSE_SIGMAS * sigma_fast + GI_RESPONSE_RELATIVE) * scale;
    // A mudança se confirma no quadro seguinte (spec 034, T059): o valor novo fica mais perto do que afastou a rápida (o
    // do quadro anterior) que da lenta. O pico raro de poucos raios numa fonte pequena volta para a lenta e não recomeça
    // a sonda; a luz que acende ou apaga fica no novo. A sonda calma não espera.
    let previous = (state.x - GI_RESPONSE_FAST * state.y) / (1.0 - GI_RESPONSE_FAST);
    let confirmed = abs(x - previous) < abs(x - state.y);
    let calm = state.z < GI_RESPONSE_RELATIVE * GI_RESPONSE_RELATIVE;
    let transient = count > 0.0 && ((exceed && calm) || (pending && confirmed));
    // Na mudança, `GI_RESPONSE_RAMP` quadros com a histerese de resposta (quadros negativos contam os que faltam) e
    // depois a contagem segue de `GI_RESPONSE_RAMP`. A mudança recomeça a rápida no valor novo e o ruído (o salto não é
    // ruído): cada degrau dos rebatimentos encadeados que ainda sobem é outra mudança, não uma média longa.
    if (transient) {
        return GiResponse(GI_RESPONSE_HYSTERESIS, vec4f(x, mix(x, state.y, GI_RESPONSE_HYSTERESIS), 0.0, -GI_RESPONSE_RAMP));
    }
    var h = min(count / (count + 1.0), gi_response_cap(state.z, hysteresis));
    var frames = count + 1.0 + select(0.0, 0.5, count > 0.0 && exceed);
    if (count < 0.0) {
        h = GI_RESPONSE_HYSTERESIS;
        frames = select(count + 1.0, GI_RESPONSE_RAMP, count + 1.0 == 0.0);
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
