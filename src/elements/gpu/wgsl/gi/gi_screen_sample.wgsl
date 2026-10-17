// Irradiância da coleta final na tela num ponto (spec 033, R2 adendo): o ponto projetado pela câmera ativa cai entre
// as sondas de tela; as 2 × 2 vizinhas pesam pela posição (bilinear), pela distância ao plano delas e pela normal. Sem
// nenhuma compatível, procura nas 4 × 4 em volta com peso de tenda mais largo. A confiança (a) diz quanto vale: 1 com
// sondas compatíveis, 0 sem nenhuma (fora da tela, bordas finas, o que não está na estrutura de raios) — aí valem as
// sondas do mundo.
// Requer: gi, cameras, gi_screen_probe_texture, gi_screen_normal_texture, gi_screen_irradiance_texture.

/** Peso de uma sonda de tela para o ponto `p` com normal `n` (0 = outro plano ou outra orientação). */
fn gi_screen_tap(t: vec2i, p: vec3f, n: vec3f, tolerance: f32) -> vec4f {
    if (any(t < vec2i(0)) || any(t >= vec2i(gi.screen.xy))) { return vec4f(0.0); }
    let probe = textureLoad(gi_screen_probe_texture, t, 0);
    if (probe.w <= 0.0) { return vec4f(0.0); }
    let pn = textureLoad(gi_screen_normal_texture, t, 0).xyz;
    let plane = abs(dot(p - probe.xyz, pn));
    let w = max(0.0, 1.0 - plane / tolerance) * smoothstep(0.85, 0.97, dot(pn, n));
    return vec4f(textureLoad(gi_screen_irradiance_texture, t, 0).rgb, 1.0) * w;
}

/** Irradiância (rgb, E) e confiança (a, 0–1) das sondas de tela no ponto `p` com normal `n`. */
fn gi_screen_irradiance(p: vec3f, n: vec3f) -> vec4f {
    if (gi.screen1.z == 0u) { return vec4f(0.0); }
    let cam = cameras[gi.screen.w];
    let clip = cam.viewProjection * vec4f(p, 1.0);
    if (clip.w <= 0.0) { return vec4f(0.0); }
    let ndc = clip.xy / clip.w;
    if (any(abs(ndc) > vec2f(1.0))) { return vec4f(0.0); }
    let px = vec2f(ndc.x * 0.5 + 0.5, 0.5 - ndc.y * 0.5) * gi.screenSize.xy;
    let g = px / gi.screenSize.z - 0.5;
    let base = vec2i(floor(g));
    let f = g - vec2f(base);
    let tolerance = 0.01 + length(p - cam.position.xyz) * 0.01;
    var acc = vec4f(0.0);
    for (var o = 0u; o < 4u; o++) {
        let d = vec2i(i32(o & 1u), i32(o >> 1u));
        let b = mix(vec2f(1.0) - f, f, vec2f(d));
        acc += gi_screen_tap(base + d, p, n, tolerance) * (b.x * b.y);
    }
    if (acc.w < 0.05) {
        acc = vec4f(0.0);
        for (var o = 0u; o < 16u; o++) {
            let d = vec2i(i32(o & 3u), i32(o >> 2u)) - vec2i(1);
            let r = abs(g - vec2f(base + d));
            let b = max(vec2f(0.0), vec2f(1.0) - r * 0.5);
            acc += gi_screen_tap(base + d, p, n, tolerance) * (b.x * b.y);
        }
    }
    if (acc.w <= 1e-4) { return vec4f(0.0); }
    return vec4f(acc.rgb / acc.w, clamp(acc.w * 4.0, 0.0, 1.0));
}
