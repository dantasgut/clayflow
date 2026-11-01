// Irradiância da coleta final na tela num ponto (spec 033, R2 adendo): o ponto projetado pela câmera ativa cai entre
// as sondas de tela; as 2 × 2 vizinhas pesam pela posição (bilinear), pela distância ao plano delas e pela normal, sem
// renormalizar para as que sobram (spec 034, T055): a soma dos pesos é a cobertura das sondas de tela no ponto, e o que
// falta (a quina, a borda de um objeto, fora da tela, o que não está na estrutura de raios) vem das sondas do mundo na
// mistura contínua de `gi_lighting_irradiance`.
// Requer: gi, gi_common (a normal empacotada), cameras, gi_screen_probe_texture, gi_screen_irradiance_texture.

/** Uma sonda de tela para um ponto: irradiância e peso (0 = sem superfície, outro plano ou outra orientação). */
struct GiScreenTap {
    e: vec3f,
    w: f32,
}

fn gi_screen_tap(t: vec2i, p: vec3f, n: vec3f, tolerance: f32) -> GiScreenTap {
    let probe = textureLoad(gi_screen_probe_texture, t, 0);
    if (probe.w <= 0.0) { return GiScreenTap(vec3f(0.0), 0.0); }
    let pn = gi_normal_unpack(probe.w);
    let plane = abs(dot(p - probe.xyz, pn));
    let w = max(0.0, 1.0 - plane / tolerance) * smoothstep(0.85, 0.97, dot(pn, n));
    return GiScreenTap(textureLoad(gi_screen_irradiance_texture, t, 0).rgb, w);
}

/**
 * Irradiância das sondas de tela no ponto `p` com normal `n` já pesada (rgb = Σ w E) e a cobertura (a = Σ w, de 0 a 1):
 * os pesos bilineares das 2 × 2 vizinhas vezes os de plano e normal, sem renormalizar — a parte que as sondas de tela
 * não cobrem (a quina, a borda, fora da tela) fica para as sondas do mundo.
 */
fn gi_screen_irradiance(p: vec3f, n: vec3f) -> vec4f {
    if (gi.screen1.z == 0u) { return vec4f(0.0); }
    let cam = cameras[gi.screen.w];
    let clip = cam.viewProjection * vec4f(p, 1.0);
    if (clip.w <= 0.0) { return vec4f(0.0); }
    let ndc = clip.xy / clip.w;
    if (any(abs(ndc) > vec2f(1.0))) { return vec4f(0.0); }
    let px = ndc_to_uv(ndc) * gi.screenSize.xy;
    let g = px / gi.screenSize.z - 0.5;
    let base = vec2i(floor(g));
    let f = g - vec2f(base);
    let tolerance = 0.01 + length(p - cam.position.xyz) * 0.01;
    var acc = vec4f(0.0);
    for (var o = 0u; o < 4u; o++) {
        let d = vec2i(i32(o & 1u), i32(o >> 1u));
        let t = base + d;
        if (any(t < vec2i(0)) || any(t >= vec2i(gi.screen.xy))) { continue; }
        let tap = gi_screen_tap(t, p, n, tolerance);
        let b = mix(vec2f(1.0) - f, f, vec2f(d));
        acc += vec4f(tap.e, 1.0) * (tap.w * b.x * b.y);
    }
    return acc;
}
