// Histórico das sondas de tela (spec 033, R2 adendo): o começo guarda a vista-projeção e a posição da câmera do quadro
// anterior; depois, duas metades (a do quadro anterior e a do atual, alternadas) com, por sonda, (posição, distância),
// (normal, 0), o estado da resposta (`gi_response`) e a irradiância de cada geração de rebatimento (E_0 = um rebatimento,
// … E_{B−1} = todos; a partir de `GI_SCREEN_HISTORY_GENERATIONS`).
// As sondas do quadro anterior em volta de um ponto (no mesmo plano e com a mesma normal, pesadas pela posição) dão o
// histórico no ponto exato — o acúmulo das sondas e os rebatimentos seguintes nos acertos dos raios (a luz das
// superfícies visíveis, exata de perto, em vez das sondas do mundo).
// Requer: NONE, gi, gi_screen_common, gi_screen_history.

const GI_SCREEN_HISTORY_HEADER: u32 = 5u;
/** Deslocamento da primeira geração na entrada de uma sonda. */
const GI_SCREEN_HISTORY_GENERATIONS: u32 = 3u;

/** vec4f por sonda numa metade do histórico. */
fn gi_screen_history_stride() -> u32 {
    return GI_SCREEN_HISTORY_GENERATIONS + gi.bounces.x;
}

/** Índice no histórico da entrada da sonda `i` na metade `half`. */
fn gi_screen_history_at(half: u32, i: u32) -> u32 {
    return GI_SCREEN_HISTORY_HEADER + (half * gi_screen_count() + i) * gi_screen_history_stride();
}

/** Metade do histórico escrita no quadro anterior. */
fn gi_screen_history_previous() -> u32 {
    return 1u - gi.screen1.y;
}

/** As sondas do quadro anterior em volta de um ponto (índices no histórico) e os pesos normalizados (soma 1; 0 = nenhuma). */
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
    let vp = mat4x4f(gi_screen_history[0], gi_screen_history[1], gi_screen_history[2], gi_screen_history[3]);
    let clip = vp * vec4f(p, 1.0);
    if (clip.w <= 0.0) { return taps; }
    let ndc = clip.xy / clip.w;
    if (any(abs(ndc) > vec2f(1.0))) { return taps; }
    let px = vec2f(ndc.x * 0.5 + 0.5, 0.5 - ndc.y * 0.5) * gi.screenSize.xy;
    let g = px / gi_screen_tile() - 0.5;
    let base = vec2i(floor(g));
    let f = g - vec2f(base);
    let tolerance = 0.01 + length(p - gi_screen_history[4].xyz) * 0.01;
    let half = gi_screen_history_previous();
    var sum = 0.0;
    for (var o = 0u; o < 4u; o++) {
        let d = vec2i(i32(o & 1u), i32(o >> 1u));
        let t = base + d;
        if (any(t < vec2i(0)) || any(t >= vec2i(gi.screen.xy))) { continue; }
        let at = gi_screen_history_at(half, u32(t.x) + u32(t.y) * gi.screen.x);
        let hp = gi_screen_history[at];
        let hn = gi_screen_history[at + 1u];
        if (hp.w <= 0.0 || dot(hn.xyz, n) < 0.95) { continue; }
        let b = mix(vec2f(1.0) - f, f, vec2f(d));
        let w = b.x * b.y * max(0.0, 1.0 - abs(dot(p - hp.xyz, n)) / tolerance);
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
        if (taps.w[o] > 0.0) { v += gi_screen_history[taps.at[o] + offset] * taps.w[o]; }
    }
    return v;
}
