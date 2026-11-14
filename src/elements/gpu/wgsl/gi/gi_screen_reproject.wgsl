// Histórico das sondas de tela (spec 033, R2 adendo): um canal temporal da C2 (spec 037) — a fatia do quadro anterior
// (`gi_screen_history_previous`, lida aqui) e a do quadro (`gi_screen_history`, escrita pelo acúmulo) — com, por sonda,
// (posição, distância), (normal, 0), o estado da resposta (`gi_response`) e a irradiância de cada geração de rebatimento
// (E_0 = um rebatimento, … E_{B−1} = todos; a partir de `GI_SCREEN_HISTORY_GENERATIONS`). No `w` da normal, 1 quando o
// ladrilho da sonda tem sondas extras (spec 034, T058).
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

/**
 * As sondas do quadro anterior em volta de um ponto (índices na fatia anterior), os pesos normalizados (soma 1; 0 =
 * nenhuma) e a cobertura (a soma dos pesos antes de normalizar, de 0 a 1): as 2 × 2 dos ladrilhos ou, onde elas têm
 * sondas extras, as 2 × 2 da grade fina.
 */
struct GiScreenTaps {
    at: vec4u,
    w: vec4f,
    cover: f32,
}

/** Cobertura das sondas de tela a partir da qual o histórico delas vale sozinho num acerto (a mesma do desenho). */
const GI_SCREEN_HISTORY_FULL: f32 = 0.5;

/** Índice no histórico do mapa fino do ladrilho `tile` (depois das entradas de todas as sondas). */
fn gi_screen_history_map_at(tile: u32) -> u32 {
    return gi_screen_total() * gi_screen_history_stride() + tile;
}

/**
 * A sonda do quadro anterior no texel fino `t` (dentro da grade fina): a do ladrilho no texel par, a extra da posição
 * fina pelo mapa do quadro anterior nos outros; NONE sem.
 */
fn gi_screen_history_fine_probe(t: vec2u) -> u32 {
    let tile = t / 2u;
    if (any(tile >= gi.screen.xy)) { return NONE; }
    let index = tile.x + tile.y * gi.screen.x;
    if (((t.x | t.y) & 1u) == 0u) { return index; }
    let slot = u32(gi_screen_history_previous[gi_screen_history_map_at(index)][gi_screen_fine_slot(t)]);
    if (slot == 0u) { return NONE; }
    return gi_screen_count() + slot - 1u;
}

/**
 * As sondas do quadro anterior em volta do ponto `p` com a normal `n`: as 2 × 2 em volta da projeção dele pela
 * vista-projeção anterior, pesadas pela posição (bilinear), pela distância ao plano delas e pela normal — o histórico
 * no ponto exato, também com a câmera andando. A tolerância do plano cresce com a distância à câmera (a precisão do
 * acerto do raio da câmera). Onde as dos ladrilhos têm sondas extras (a dobra côncava), as 2 × 2 da grade fina (as dos ladrilhos e as extras) pesam pela cobertura delas, e as dos ladrilhos pelo que falta.
 * A cobertura sai zerada quando o ponto está atrás da superfície de uma das 2 × 2 (`gi_screen_history_behind`).
 */
fn gi_screen_history_taps(p: vec3f, n: vec3f) -> GiScreenTaps {
    var taps = GiScreenTaps(vec4u(NONE), vec4f(0.0), 0.0);
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
    let world = rigid_inverse(cam.previousView);
    let dp = length(p - world[3].xyz);
    // A direção do raio da câmera anterior pelo ponto: da câmera (perspectiva) ou a da vista (ortográfica).
    var view = (p - world[3].xyz) / max(dp, 1e-6);
    if (is_orthographic(cam.projection)) { view = -normalize(world[2].xyz); }
    let tolerance = 0.01 + dp * 0.01;
    var sum = 0.0;
    var extra = false;
    var hidden = false;
    for (var o = 0u; o < 4u; o++) {
        let d = vec2i(i32(o & 1u), i32(o >> 1u));
        let t = base + d;
        if (any(t < vec2i(0)) || any(t >= vec2i(gi.screen.xy))) { continue; }
        let at = gi_screen_history_at(u32(t.x) + u32(t.y) * gi.screen.x);
        let hp = gi_screen_history_previous[at];
        let hn = gi_screen_history_previous[at + 1u];
        if (hp.w <= 0.0) { continue; }
        extra = extra || hn.w > 0.5;
        let b = mix(vec2f(1.0) - f, f, vec2f(d));
        let w = b.x * b.y * temporal_validate_plane(hp.xyz, hn.xyz, p, n, tolerance, 0.95);
        // A vizinha de outra superfície voltada para a câmera cujo plano o raio da câmera cruza antes do ponto: o ponto
        // está atrás dela (as sondas como profundidade grossa do quadro anterior).
        if (w <= 0.0) { hidden = hidden || gi_screen_history_behind(hp.xyz, hn.xyz, p, view, tolerance); }
        taps.at[o] = at;
        taps.w[o] = w;
        sum += w;
    }
    // A grade fina só onde as dos ladrilhos têm sondas extras (a extra acumula o próprio histórico, não o das vizinhas):
    // as 2 × 2 dela (as dos ladrilhos nos texels pares, as extras nos outros) no lugar das dos ladrilhos.
    if (extra) {
        let gf = px / (0.5 * gi_screen_tile()) - 1.0;
        let fb = vec2i(floor(gf));
        let ff = gf - vec2f(fb);
        var fine = GiScreenTaps(vec4u(NONE), vec4f(0.0), 0.0);
        var fsum = 0.0;
        for (var o = 0u; o < 4u; o++) {
            let d = vec2i(i32(o & 1u), i32(o >> 1u));
            let t = fb + d;
            if (!gi_screen_fine_inside(t)) { continue; }
            let j = gi_screen_history_fine_probe(vec2u(t));
            if (j == NONE) { continue; }
            let at = gi_screen_history_at(j);
            let hp = gi_screen_history_previous[at];
            let hn = gi_screen_history_previous[at + 1u];
            if (hp.w <= 0.0) { continue; }
            let b = mix(vec2f(1.0) - ff, ff, vec2f(d));
            let w = b.x * b.y * temporal_validate_plane(hp.xyz, hn.xyz, p, n, tolerance, 0.95);
            fine.at[o] = at;
            fine.w[o] = w;
            fsum += w;
        }
        if (fsum > 1e-4) {
            taps = fine;
            sum = fsum;
        }
    }
    taps.cover = select(min(sum, 1.0), 0.0, hidden);
    if (sum > 1e-4) { taps.w = taps.w / sum; } else { taps.w = vec4f(0.0); }
    return taps;
}

/**
 * A confiança do histórico das sondas de tela num ponto atingido por um raio: a cobertura até
 * `GI_SCREEN_HISTORY_FULL` (como no desenho, `gi_lighting_irradiance`); 0 no ponto escondido atrás de outra superfície.
 * Abaixo dela, a parte que falta vem das sondas do mundo. Sem isso, o chão atrás de um bloco caía na tela ao lado do
 * chão da frente dele — o mesmo plano, a vizinha valia — e levava a luz daquele chão; e uma só vizinha valendo por um
 * peso pequeno, normalizado a 1, levava a luz dela até um ladrilho de distância (no `giNoise`, a caixa de Cornell alta:
 * manchas de 5,9 % para 2,7 %, o viés do chão de 7,7 % para 0,5 %).
 */
fn gi_screen_history_confidence(taps: GiScreenTaps) -> f32 {
    if (!gi_screen_history_found(taps)) { return 0.0; }
    return saturate(taps.cover / GI_SCREEN_HISTORY_FULL);
}

/**
 * O ponto `p`, visto pela câmera anterior na direção `view`, está atrás da superfície da sonda `q` (normal `qn`)? O plano
 * dela voltado para a câmera e cruzado pelo raio da câmera mais de `tolerance` antes do ponto. Perto de uma borda
 * convexa o plano estendido também cruza pontos que se veem (a profundidade é grossa, um ladrilho): esses ficam com as
 * sondas do mundo, como os escondidos.
 */
fn gi_screen_history_behind(q: vec3f, qn: vec3f, p: vec3f, view: vec3f, tolerance: f32) -> bool {
    let facing = dot(view, qn);
    if (facing > -0.05) { return false; }
    return dot(q - p, qn) / facing < -tolerance;
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
