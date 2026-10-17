// Histerese adaptativa das sondas (spec 033, R5, US4) — a regra de `reference/response.ts`. Estado por sonda: média
// rápida e lenta da luminância, ruído (variância relativa à rápida) e quadros desde o último recomeço. Quando a rápida se
// afasta da lenta mais do que o ruído explica, a luz mudou de verdade: a histerese do quadro é a de resposta e a contagem
// recomeça (as seguintes 1/2, 2/3, …: a média só dos valores novos); parado, a histerese do acúmulo.

const GI_RESPONSE_FAST: f32 = 0.75;
const GI_RESPONSE_HYSTERESIS: f32 = 0.3;
const GI_RESPONSE_SIGMAS: f32 = 3.0;
const GI_RESPONSE_RELATIVE: f32 = 0.05;
const GI_RESPONSE_NOISE: f32 = 0.9;

/** Um quadro da resposta: a histerese do quadro e o estado seguinte (rápida, lenta, ruído, quadros). */
struct GiResponse {
    h: f32,
    state: vec4f,
}

/** A histerese do quadro para a luminância nova `x` (0 ao recomeçar: `state.w` = 0). */
fn gi_response(state: vec4f, x: f32, hysteresis: f32) -> GiResponse {
    if (state.w <= 0.0) { return GiResponse(0.0, vec4f(x, x, 0.0, 1.0)); }
    let fast = mix(x, state.x, GI_RESPONSE_FAST);
    let d = select(0.0, x / state.x - 1.0, state.x > 1e-6);
    let noise = mix(d * d, state.z, GI_RESPONSE_NOISE);
    let scale = max(fast, state.y);
    let sigma_fast = sqrt(state.z * ((1.0 - GI_RESPONSE_FAST) / (1.0 + GI_RESPONSE_FAST)));
    let transient = abs(fast - state.y) > (GI_RESPONSE_SIGMAS * sigma_fast + GI_RESPONSE_RELATIVE) * scale;
    let h = select(min(state.w / (state.w + 1.0), hysteresis), GI_RESPONSE_HYSTERESIS, transient);
    return GiResponse(h, vec4f(fast, mix(x, state.y, h), noise, select(state.w + 1.0, 1.0, transient)));
}

/** Luminância de uma radiância. */
fn gi_response_luminance(c: vec3f) -> f32 {
    return dot(c, vec3f(0.2126, 0.7152, 0.0722));
}
