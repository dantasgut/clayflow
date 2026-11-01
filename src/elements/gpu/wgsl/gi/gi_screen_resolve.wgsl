// Acúmulo das sondas de tela (spec 033, R2 adendo). Por sonda e geração de rebatimento: a irradiância do quadro (dos
// raios) misturada ao histórico no mesmo ponto (`gi_screen_history_taps`: as sondas do quadro anterior em volta da projeção,
// no mesmo plano e com a mesma normal; sem nenhuma, o acúmulo recomeça) pela histerese adaptativa (`gi_response`: a do acúmulo, `gi.screenSize.w`,
// parado; a de resposta quando a luz muda de verdade).
// Escreve a textura das sondas que o desenho lê, a fatia do quadro do histórico (o canal temporal, spec 037: o quadro
// seguinte a lê como a anterior) e a semente do filtro à-trous (a última geração — todos os rebatimentos — e a
// variância), que escreve a irradiância do desenho.
// Requer: WORKGROUP_SIZE, gi, gi_screen_common, gi_screen_reproject, gi_response, cameras, gi_screen_history,
// gi_screen_work, gi_screen_probe_out, gi_screen_irradiance_out, gi_screen_filter, gi_screen_filter_step, color.

@compute @workgroup_size(WORKGROUP_SIZE)
fn gi_screen_resolve_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let i = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    if (i >= gi_screen_count()) { return; }
    let tile = vec2u(i % gi.screen.x, i / gi.screen.x);
    let bounces = gi.bounces.x;
    let out = gi_screen_history_at(i);
    let probe = gi_screen_work[gi_screen_probe_at(i)];
    if (probe.w <= 0.0) {
        for (var k = 0u; k < gi_screen_history_stride(); k++) { gi_screen_history[out + k] = vec4f(0.0); }
        gi_screen_filter[i] = vec4f(0.0);
        textureStore(gi_screen_probe_out, tile, vec4f(0.0));
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
        state = gi_screen_history_previous[taps.at[best] + 2u];
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
        e = temporal_hysteresis(vec4f(fresh, 0.0), vec4f(history, 0.0), response.h).rgb;
        gi_screen_history[out + GI_SCREEN_HISTORY_GENERATIONS + g] = vec4f(e, 0.0);
    }
    gi_screen_history[out] = probe;
    gi_screen_history[out + 1u] = vec4f(n, 0.0);
    gi_screen_history[out + 2u] = response.state;
    // A semente do filtro (T054): todos os rebatimentos e a variância da média acumulada (o desvio relativo estimado da
    // sonda na luminância dela).
    let sd = gi_screen_noise(response.state) * luminance(e);
    gi_screen_filter[i] = vec4f(e, sd * sd);
    // A posição e, no w, a normal empacotada (> 0: há superfície).
    textureStore(gi_screen_probe_out, tile, vec4f(probe.xyz, gi_normal_pack(n)));
}

/**
 * Desvio relativo estimado da média acumulada de uma sonda (o ruído dos raios reduzido pelos quadros acumulados):
 * σ · √((1 − h)/(1 + h)) com a histerese em que a sonda está.
 */
fn gi_screen_noise(state: vec4f) -> f32 {
    // Nos quadros de resposta (contagem negativa), a histerese de resposta.
    let h = select(min(state.w / (state.w + 1.0), gi_response_cap(state.z, gi.screenSize.w)), GI_RESPONSE_HYSTERESIS,
        state.w < 0.0);
    return sqrt(max(state.z * (1.0 - h) / (1.0 + h), 0.0));
}

/** Pesos do núcleo B3 do à-trous por distância em passos (0, 1, 2). */
const GI_ATROUS_KERNEL = array<f32, 3>(0.375, 0.25, 0.0625);
/** Desvios da luminância (pela variância da sonda) acima dos quais a vizinha não pesa (SVGF). */
const GI_ATROUS_LUMA: f32 = 4.0;
/** Teto do desvio da luminância, como fração da luminância da sonda. */
const GI_ATROUS_RELATIVE: f32 = 0.05;

/**
 * Filtro à-trous das sondas de tela guiado pela variância (spec 034, T054; SVGF, Schied et al. 2017), um passe por
 * despacho: as 5 × 5 vizinhas a `passo` ladrilhos (1, 2 e 4 nos três passes: o alcance de 17 ladrilhos — as manchas do
 * acúmulo são de 2 a 3), pesadas pelo núcleo B3, pelo plano, pela normal e pela luminância relativa ao desvio da sonda —
 * a convergida (variância perto de zero) fica como está (a luz de perto), a ruidosa é suavizada; a variância segue
 * pelos quadrados dos pesos. Ida e volta numa metade de `gi_screen_filter` cada (`gi_screen_filter_step`: o passo, a
 * metade lida, a escrita e se é o último, que escreve a textura do desenho); o acúmulo semeia a primeira metade.
 */
@compute @workgroup_size(WORKGROUP_SIZE)
fn gi_screen_filter_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let i = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    let count = gi_screen_count();
    if (i >= count) { return; }
    let tile = vec2i(i32(i % gi.screen.x), i32(i / gi.screen.x));
    let step = i32(gi_screen_filter_step.step.x);
    let src = gi_screen_filter_step.step.y * count;
    let dst = gi_screen_filter_step.step.z * count;
    let last = gi_screen_filter_step.step.w == 1u;
    // A fatia do quadro do histórico (o acúmulo acabou de escrevê-la): a posição e a normal das sondas.
    let at = gi_screen_history_at(i);
    let probe = gi_screen_history[at];
    if (probe.w <= 0.0) {
        gi_screen_filter[dst + i] = vec4f(0.0);
        if (last) { textureStore(gi_screen_irradiance_out, vec2u(tile), vec4f(0.0)); }
        return;
    }
    let n = gi_screen_history[at + 1u].xyz;
    let c = gi_screen_filter[src + i];
    let lc = luminance(c.rgb);
    let sigma = GI_ATROUS_LUMA * sqrt(max(c.w, 0.0)) + 1e-3 * lc + 1e-8;
    // O desvio limitado a uma fração da luminância da sonda: com a variância da média recém-recomeçada (a luz mudou),
    // sem o limite o filtro levaria a luz do lugar que mudou para os vizinhos que não mudaram e a resposta atrasaria.
    let pair = min(sigma, GI_ATROUS_RELATIVE * lc + 1e-8);
    let tolerance = 0.01 + probe.w * 0.01;
    let kc = GI_ATROUS_KERNEL[0] * GI_ATROUS_KERNEL[0];
    var sum = c.rgb * kc;
    var vsum = max(c.w, 0.0) * kc * kc;
    var wsum = kc;
    for (var o = 0u; o < 25u; o++) {
        let d = vec2i(i32(o % 5u) - 2, i32(o / 5u) - 2);
        if (all(d == vec2i(0))) { continue; }
        let t = tile + d * step;
        if (any(t < vec2i(0)) || any(t >= vec2i(gi.screen.xy))) { continue; }
        let j = u32(t.x) + u32(t.y) * gi.screen.x;
        let hq = gi_screen_history_at(j);
        let q = gi_screen_history[hq];
        if (q.w <= 0.0) { continue; }
        let qn = gi_screen_history[hq + 1u].xyz;
        let s = gi_screen_filter[src + j];
        let plane = abs(dot(q.xyz - probe.xyz, n));
        let w = GI_ATROUS_KERNEL[abs(d.x)] * GI_ATROUS_KERNEL[abs(d.y)] * max(0.0, 1.0 - plane / tolerance)
            * smoothstep(0.9, 0.98, dot(qn, n)) * exp(-abs(luminance(s.rgb) - lc) / pair);
        sum += s.rgb * w;
        vsum += max(s.w, 0.0) * w * w;
        wsum += w;
    }
    let out = vec4f(sum / wsum, vsum / (wsum * wsum));
    gi_screen_filter[dst + i] = out;
    if (last) { textureStore(gi_screen_irradiance_out, vec2u(tile), vec4f(out.rgb, 1.0)); }
}
