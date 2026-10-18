// Histerese adaptativa das sondas (spec 033, R5, US4) — a regra de `reference/response.ts`. Estado por sonda: média
// rápida e lenta do maior canal da radiância, ruído (variância relativa à rápida) e quadros desde o último recomeço. Quando a rápida se
// afasta da lenta mais do que o ruído explica, a luz mudou de verdade: alguns quadros com a histerese de resposta (o estado
// anterior some exponencialmente) e depois a contagem segue; parado, a histerese do acúmulo.

const GI_RESPONSE_FAST: f32 = 0.65;
const GI_RESPONSE_HYSTERESIS: f32 = 0.3;
const GI_RESPONSE_SIGMAS: f32 = 2.5;
const GI_RESPONSE_RELATIVE: f32 = 0.03;
const GI_RESPONSE_NOISE: f32 = 0.9;
const GI_RESPONSE_RAMP: f32 = 3.0;

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
    let transient = abs(fast - state.y) > (GI_RESPONSE_SIGMAS * sigma_fast + GI_RESPONSE_RELATIVE) * scale;
    // Na mudança, `GI_RESPONSE_RAMP` quadros com a histerese de resposta (quadros negativos contam os que faltam) e
    // depois a contagem segue de `GI_RESPONSE_RAMP`.
    var h = min(state.w / (state.w + 1.0), hysteresis);
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
    return max(max(c.r, c.g), c.b);
}
