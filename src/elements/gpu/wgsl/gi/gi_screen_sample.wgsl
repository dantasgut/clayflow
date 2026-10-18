// Irradiância da coleta final na tela num ponto (spec 033, R2 adendo): o ponto projetado pela câmera ativa cai entre
// as sondas de tela; as 2 × 2 vizinhas pesam pela posição (bilinear), pela distância ao plano delas e pela normal. Sem
// nenhuma compatível, a válida mais próxima de orientação parecida (borda, superfície curva, ou um fragmento que não vira
// pixel: encoberto ou auxiliar do quad) — barato, e quem não vira pixel não paga a leitura das sondas do mundo; de
// orientação diferente (uma face fina — o vão de uma janela — tem as suas sondas em alguns ladrilhos da faixa, não em
// todos), as compatíveis num raio de 2 ladrilhos, pela distância; sem nenhuma, a mais próxima mesmo assim. A confiança (a): 1
// com sondas compatíveis, 0,5 com a mais próxima, 0 sem nenhuma válida (fora da tela, o que não está na estrutura de
// raios) — aí valem as sondas do mundo.
// Requer: gi, gi_common (a normal empacotada), cameras, gi_screen_probe_texture, gi_screen_irradiance_texture.

/** Uma sonda de tela para um ponto: irradiância, peso (0 = outro plano ou orientação), se há superfície e a orientação. */
struct GiScreenTap {
    e: vec3f,
    w: f32,
    valid: bool,
    facing: f32,
}

fn gi_screen_tap(t: vec2i, p: vec3f, n: vec3f, tolerance: f32) -> GiScreenTap {
    let probe = textureLoad(gi_screen_probe_texture, t, 0);
    if (probe.w <= 0.0) { return GiScreenTap(vec3f(0.0), 0.0, false, 0.0); }
    let pn = gi_normal_unpack(probe.w);
    let plane = abs(dot(p - probe.xyz, pn));
    let facing = dot(pn, n);
    let w = max(0.0, 1.0 - plane / tolerance) * smoothstep(0.85, 0.97, facing);
    return GiScreenTap(textureLoad(gi_screen_irradiance_texture, t, 0).rgb, w, true, facing);
}

/** Irradiância (rgb, E) e confiança (a: 1, 0,5 ou 0) das sondas de tela no ponto `p` com normal `n`. */
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
    var acc = vec3f(0.0);
    var wsum = 0.0;
    var nearest = vec3f(0.0);
    var nearest_d = 1e9;
    var nearest_facing = 1.0;
    for (var o = 0u; o < 4u; o++) {
        let d = vec2i(i32(o & 1u), i32(o >> 1u));
        let t = base + d;
        if (any(t < vec2i(0)) || any(t >= vec2i(gi.screen.xy))) { continue; }
        let tap = gi_screen_tap(t, p, n, tolerance);
        let b = mix(vec2f(1.0) - f, f, vec2f(d));
        let w = tap.w * b.x * b.y;
        acc += tap.e * w;
        wsum += w;
        let dist = length(g - vec2f(t));
        if (tap.valid && dist < nearest_d) {
            nearest_d = dist;
            nearest = tap.e;
            nearest_facing = tap.facing;
        }
    }
    if (wsum > 1e-4) { return vec4f(acc / wsum, 1.0); }
    // A mais próxima de orientação parecida (fora do plano: borda, superfície curva, o encoberto) vale como está.
    if (nearest_d < 1e8 && nearest_facing > 0.5) { return vec4f(nearest, 0.5); }
    // Orientação diferente (a face fina): as compatíveis em volta (5 × 5 ladrilhos), pesadas pela distância na grade.
    for (var o = 0u; o < 25u; o++) {
        let t = base + vec2i(i32(o % 5u) - 2, i32(o / 5u) - 2);
        if (any(t < vec2i(0)) || any(t >= vec2i(gi.screen.xy))) { continue; }
        let tap = gi_screen_tap(t, p, n, tolerance);
        let d = g - vec2f(t);
        let w = tap.w / (1.0 + dot(d, d));
        acc += tap.e * w;
        wsum += w;
    }
    if (wsum > 1e-4) { return vec4f(acc / wsum, 0.5); }
    if (nearest_d < 1e8) { return vec4f(nearest, 0.5); }
    return vec4f(0.0);
}
