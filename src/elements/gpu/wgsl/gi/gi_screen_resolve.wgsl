// Acúmulo das sondas de tela (spec 033, R2 adendo). Por sonda e geração de rebatimento: a irradiância do quadro (dos
// raios) misturada ao histórico no mesmo ponto (`gi_screen_history_taps`: as sondas do quadro anterior em volta da projeção,
// no mesmo plano e com a mesma normal; sem nenhuma, o acúmulo recomeça) pela histerese adaptativa (`gi_response`: a do acúmulo, `gi.screenSize.w`,
// parado; a de resposta quando a luz muda de verdade).
// Escreve as texturas que o desenho lê (a última geração: todos os rebatimentos) e a metade do histórico do quadro.
// Depois, `gi_screen_finish_main` guarda a vista-projeção e a posição da câmera para o quadro seguinte.
// Requer: WORKGROUP_SIZE, gi, gi_screen_common, gi_screen_reproject, gi_response, cameras, gi_screen_work,
// gi_screen_probe_out, gi_screen_normal_out, gi_screen_irradiance_out.

@compute @workgroup_size(WORKGROUP_SIZE)
fn gi_screen_resolve_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let i = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    if (i >= gi_screen_count()) { return; }
    let tile = vec2u(i % gi.screen.x, i / gi.screen.x);
    let bounces = gi.bounces.x;
    let out = gi_screen_history_at(gi.screen1.y, i);
    let probe = gi_screen_work[gi_screen_probe_at(i)];
    if (probe.w <= 0.0) {
        for (var k = 0u; k < gi_screen_history_stride(); k++) { gi_screen_history[out + k] = vec4f(0.0); }
        textureStore(gi_screen_probe_out, tile, vec4f(0.0));
        textureStore(gi_screen_normal_out, tile, vec4f(0.0));
        textureStore(gi_screen_irradiance_out, tile, vec4f(0.0));
        return;
    }
    let n = gi_screen_work[gi_screen_probe_at(i) + 1u].xyz;
    let taps = gi_screen_history_taps(probe.xyz, n);
    let found = gi_screen_history_found(taps);
    var state = vec4f(0.0);
    if (found) {
        // O estado da resposta da sonda anterior mais pesada (a contagem não se mistura entre sondas).
        var best = 0u;
        for (var o = 1u; o < 4u; o++) { if (taps.w[o] > taps.w[best]) { best = o; } }
        state = gi_screen_history[taps.at[best] + 2u];
    }
    // A histerese pelo maior canal de todos os rebatimentos (a última geração), a mesma para todas as gerações.
    // Fora da vez no rodízio (sem raios no quadro): o histórico reprojetado, sem mistura e com o estado como estava.
    let inherit = found && gi_screen_work[gi_screen_fresh_at(i, 0u)].w < 0.0;
    let last = gi_screen_work[gi_screen_fresh_at(i, bounces - 1u)].rgb;
    var response = GiResponse(1.0, state);
    if (!inherit) { response = gi_response(state, gi_response_value(last), gi.screenSize.w); }
    var e = vec3f(0.0);
    for (var g = 0u; g < bounces; g++) {
        let fresh = gi_screen_work[gi_screen_fresh_at(i, g)].rgb;
        var history = fresh;
        if (found) { history = gi_screen_history_gather(taps, GI_SCREEN_HISTORY_GENERATIONS + g).rgb; }
        e = mix(fresh, history, response.h);
        gi_screen_history[out + GI_SCREEN_HISTORY_GENERATIONS + g] = vec4f(e, 0.0);
    }
    gi_screen_history[out] = probe;
    gi_screen_history[out + 1u] = vec4f(n, 0.0);
    gi_screen_history[out + 2u] = response.state;
    textureStore(gi_screen_probe_out, tile, vec4f(probe.xyz, 1.0));
    textureStore(gi_screen_normal_out, tile, vec4f(n, 1.0));
}

/**
 * Desvio relativo estimado da média acumulada de uma sonda (o ruído dos raios reduzido pelos quadros acumulados):
 * σ · √((1 − h)/(1 + h)) com a histerese em que a sonda está.
 */
fn gi_screen_noise(state: vec4f) -> f32 {
    // Nos quadros de resposta (contagem negativa), a histerese de resposta.
    let h = select(min(state.w / (state.w + 1.0), gi.screenSize.w), GI_RESPONSE_HYSTERESIS, state.w < 0.0);
    return sqrt(max(state.z * (1.0 - h) / (1.0 + h), 0.0));
}

/**
 * Filtro espacial das sondas de tela para o desenho (o histórico fica sem filtro): as 5 × 5 vizinhas do quadro, pesadas
 * pela gaussiana (σ = 1,2 ladrilho: o resíduo do acúmulo forma manchas de 2 a 3 ladrilhos), pelo plano e pela normal, com força pelo ruído estimado da sonda — a convergida e sem ruído fica
 * quase como está (a luz de perto), a ruidosa (recém-descoberta, fonte pequena) é suavizada.
 */
@compute @workgroup_size(WORKGROUP_SIZE)
fn gi_screen_filter_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let i = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    if (i >= gi_screen_count()) { return; }
    let tile = vec2i(i32(i % gi.screen.x), i32(i / gi.screen.x));
    let half = gi.screen1.y;
    let at = gi_screen_history_at(half, i);
    let probe = gi_screen_history[at];
    if (probe.w <= 0.0) {
        textureStore(gi_screen_irradiance_out, vec2u(tile), vec4f(0.0));
        return;
    }
    let n = gi_screen_history[at + 1u].xyz;
    let last = GI_SCREEN_HISTORY_GENERATIONS + gi.bounces.x - 1u;
    let strength = clamp(gi_screen_noise(gi_screen_history[at + 2u]) / 0.02, 0.0, 1.0);
    let tolerance = 0.01 + probe.w * 0.01;
    var sum = gi_screen_history[at + last].rgb;
    var wsum = 1.0;
    for (var o = 0u; o < 25u; o++) {
        let d = vec2i(i32(o % 5u) - 2, i32(o / 5u) - 2);
        if (all(d == vec2i(0))) { continue; }
        let t = tile + d;
        if (any(t < vec2i(0)) || any(t >= vec2i(gi.screen.xy))) { continue; }
        let j = gi_screen_history_at(half, u32(t.x) + u32(t.y) * gi.screen.x);
        let q = gi_screen_history[j];
        if (q.w <= 0.0) { continue; }
        let qn = gi_screen_history[j + 1u].xyz;
        let plane = abs(dot(q.xyz - probe.xyz, n));
        let w = exp(-f32(d.x * d.x + d.y * d.y) / (2.0 * 1.2 * 1.2)) * strength * max(0.0, 1.0 - plane / tolerance)
            * smoothstep(0.9, 0.98, dot(qn, n));
        sum += gi_screen_history[j + last].rgb * w;
        wsum += w;
    }
    textureStore(gi_screen_irradiance_out, vec2u(tile), vec4f(sum / wsum, 1.0));
}

/** Guarda a vista-projeção e a posição da câmera ativa para o quadro seguinte (uma invocação). */
@compute @workgroup_size(1)
fn gi_screen_finish_main() {
    let cam = cameras[gi.screen.w];
    for (var c = 0u; c < 4u; c++) { gi_screen_history[c] = cam.viewProjection[c]; }
    gi_screen_history[4] = cam.position;
}
