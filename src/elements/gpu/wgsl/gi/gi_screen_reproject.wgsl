// Histórico das sondas de tela (spec 033, R2 adendo): o começo guarda a vista-projeção e a posição da câmera do quadro
// anterior; depois, duas metades (a do quadro anterior e a do atual, alternadas) com, por sonda, (posição, distância),
// (normal, quadros acumulados) e a irradiância de cada geração de rebatimento (E_0 = um rebatimento, … E_{B−1} = todos).
// A busca acha, para um ponto e uma normal, a sonda do quadro anterior no mesmo plano e com a mesma normal entre os 2 × 2
// ladrilhos em volta da projeção dele pela vista-projeção anterior — o acúmulo das sondas e os rebatimentos seguintes nos
// acertos dos raios (a luz das superfícies visíveis, exata de perto, em vez das sondas do mundo).
// Requer: NONE, gi, gi_screen_common, gi_screen_history.

const GI_SCREEN_HISTORY_HEADER: u32 = 5u;

/** vec4f por sonda numa metade do histórico. */
fn gi_screen_history_stride() -> u32 {
    return 2u + gi.bounces.x;
}

/** Índice no histórico da entrada da sonda `i` na metade `half`. */
fn gi_screen_history_at(half: u32, i: u32) -> u32 {
    return GI_SCREEN_HISTORY_HEADER + (half * gi_screen_count() + i) * gi_screen_history_stride();
}

/** Metade do histórico escrita no quadro anterior. */
fn gi_screen_history_previous() -> u32 {
    return 1u - gi.screen1.y;
}

/**
 * A entrada da sonda do quadro anterior no plano do ponto `p` com a normal `n` (índice no histórico), ou `NONE`. A
 * tolerância do plano cresce com a distância à câmera (a precisão do acerto do raio da câmera).
 */
fn gi_screen_history_find(p: vec3f, n: vec3f) -> u32 {
    let vp = mat4x4f(gi_screen_history[0], gi_screen_history[1], gi_screen_history[2], gi_screen_history[3]);
    let clip = vp * vec4f(p, 1.0);
    if (clip.w <= 0.0) { return NONE; }
    let ndc = clip.xy / clip.w;
    if (any(abs(ndc) > vec2f(1.0))) { return NONE; }
    let px = vec2f(ndc.x * 0.5 + 0.5, 0.5 - ndc.y * 0.5) * gi.screenSize.xy;
    let g = px / gi_screen_tile() - 0.5;
    let base = vec2i(floor(g));
    let tolerance = 0.01 + length(p - gi_screen_history[4].xyz) * 0.01;
    let half = gi_screen_history_previous();
    var best = tolerance;
    var found = NONE;
    for (var o = 0u; o < 4u; o++) {
        let t = base + vec2i(i32(o & 1u), i32(o >> 1u));
        if (any(t < vec2i(0)) || any(t >= vec2i(gi.screen.xy))) { continue; }
        let at = gi_screen_history_at(half, u32(t.x) + u32(t.y) * gi.screen.x);
        let hp = gi_screen_history[at];
        let hn = gi_screen_history[at + 1u];
        if (hp.w <= 0.0 || dot(hn.xyz, n) < 0.95) { continue; }
        let d = abs(dot(p - hp.xyz, n)) + 0.25 * length(p - hp.xyz) / gi_screen_tile();
        if (d < best) {
            best = d;
            found = at;
        }
    }
    return found;
}
