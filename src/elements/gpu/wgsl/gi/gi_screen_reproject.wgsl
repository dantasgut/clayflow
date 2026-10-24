// Histórico das sondas de tela (spec 033, R2 adendo): um canal temporal da C2 (spec 037) — a fatia do quadro anterior
// (`gi_screen_history_previous`, lida aqui) e a do quadro (`gi_screen_history`, escrita pelo acúmulo) — com, por sonda,
// (posição, distância), (normal, 0), o estado da resposta (`gi_response`) e a irradiância de cada geração de rebatimento
// (E_0 = um rebatimento, … E_{B−1} = todos; a partir de `GI_SCREEN_HISTORY_GENERATIONS`).
// As sondas do quadro anterior em volta de um ponto (no mesmo plano e com a mesma normal, pesadas pela posição) dão o
// histórico no ponto exato — o acúmulo das sondas e os rebatimentos seguintes nos acertos dos raios (a luz das
// superfícies visíveis, exata de perto, em vez das sondas do mundo).
// Requer: NONE, gi, gi_screen_common, gi_screen_history_previous, temporal, cameras, xform_rigid.

/** Deslocamento da primeira geração na entrada de uma sonda. */
const GI_SCREEN_HISTORY_GENERATIONS: u32 = 3u;

/** vec4f por sonda numa fatia do histórico. */
fn gi_screen_history_stride() -> u32 {
    return GI_SCREEN_HISTORY_GENERATIONS + gi.bounces.x;
}

/** Índice da entrada da sonda `i` numa fatia do histórico. */
fn gi_screen_history_at(i: u32) -> u32 {
    return i * gi_screen_history_stride();
}

/** As sondas do quadro anterior em volta de um ponto (índices na fatia anterior) e os pesos normalizados (soma 1; 0 = nenhuma). */
struct GiScreenTaps {
    at: vec4u,
    w: vec4f,
}

/**
 * As sondas do quadro anterior em volta do ponto `p` com a normal `n`: as 2 × 2 em volta da projeção dele pela
 * vista-projeção anterior, pesadas pela posição (bilinear), pela distância ao plano delas e pela normal — o histórico
 * no ponto exato, também com a câmera andando. A tolerância do plano cresce com a distância à câmera (a precisão do
 * acerto do raio da câmera).
 */
fn gi_screen_history_taps(p: vec3f, n: vec3f) -> GiScreenTaps {
    var taps = GiScreenTaps(vec4u(NONE), vec4f(0.0));
    // A vista-projeção anterior sem o deslocamento da amostra e a câmera anterior (spec 037): as guardadas da câmera.
    let cam = cameras[gi.screen.w];
    // Sem histórico no corte de câmera (`history.x`, spec 037).
    if (temporal_cut(cam.history)) { return taps; }
    let previous = temporal_reproject_point(cam.previousViewProjection, p);
    if (previous.z == 0.0) { return taps; }
    let px = previous.xy * gi.screenSize.xy;
    let g = px / gi_screen_tile() - 0.5;
    let base = vec2i(floor(g));
    let f = g - vec2f(base);
    let tolerance = 0.01 + length(p - rigid_inverse(cam.previousView)[3].xyz) * 0.01;
    var sum = 0.0;
    for (var o = 0u; o < 4u; o++) {
        let d = vec2i(i32(o & 1u), i32(o >> 1u));
        let t = base + d;
        if (any(t < vec2i(0)) || any(t >= vec2i(gi.screen.xy))) { continue; }
        let at = gi_screen_history_at(u32(t.x) + u32(t.y) * gi.screen.x);
        let hp = gi_screen_history_previous[at];
        let hn = gi_screen_history_previous[at + 1u];
        if (hp.w <= 0.0) { continue; }
        let b = mix(vec2f(1.0) - f, f, vec2f(d));
        let w = b.x * b.y * temporal_validate_plane(hp.xyz, hn.xyz, p, n, tolerance, 0.95);
        taps.at[o] = at;
        taps.w[o] = w;
        sum += w;
    }
    if (sum > 1e-4) { taps.w = taps.w / sum; } else { taps.w = vec4f(0.0); }
    return taps;
}

/** Há histórico no ponto? */
fn gi_screen_history_found(taps: GiScreenTaps) -> bool {
    return taps.w.x + taps.w.y + taps.w.z + taps.w.w > 0.5;
}

/** O campo `offset` das entradas do histórico em volta do ponto, pelos pesos. */
fn gi_screen_history_gather(taps: GiScreenTaps, offset: u32) -> vec4f {
    var v = vec4f(0.0);
    for (var o = 0u; o < 4u; o++) {
        if (taps.w[o] > 0.0) { v += gi_screen_history_previous[taps.at[o] + offset] * taps.w[o]; }
    }
    return v;
}
