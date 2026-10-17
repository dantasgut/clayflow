// Acúmulo das sondas de tela (spec 033, R2 adendo). Por sonda e geração de rebatimento: a irradiância do quadro (dos
// raios) misturada à da mesma sonda no quadro anterior (`gi_screen_history_find`: reprojetada, no mesmo plano e com a
// mesma normal; sem ela, o acúmulo recomeça), pela média dos quadros acumulados até a histerese (`gi.screenSize.w`).
// Escreve as texturas que o desenho lê (a última geração: todos os rebatimentos) e a metade do histórico do quadro.
// Depois, `gi_screen_finish_main` guarda a vista-projeção e a posição da câmera para o quadro seguinte.
// Requer: WORKGROUP_SIZE, gi, gi_screen_common, gi_screen_reproject, cameras, gi_screen_work,
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
        for (var k = 0u; k < 2u + bounces; k++) { gi_screen_history[out + k] = vec4f(0.0); }
        textureStore(gi_screen_probe_out, tile, vec4f(0.0));
        textureStore(gi_screen_normal_out, tile, vec4f(0.0));
        textureStore(gi_screen_irradiance_out, tile, vec4f(0.0));
        return;
    }
    let n = gi_screen_work[gi_screen_probe_at(i) + 1u].xyz;
    let found = gi_screen_history_find(probe.xyz, n);
    var frames = 0.0;
    if (found != NONE) { frames = gi_screen_history[found + 1u].w; }
    let h = min(frames / (frames + 1.0), gi.screenSize.w);
    var e = vec3f(0.0);
    for (var g = 0u; g < bounces; g++) {
        let fresh = gi_screen_work[gi_screen_fresh_at(i, g)].rgb;
        var history = fresh;
        if (found != NONE) { history = gi_screen_history[found + 2u + g].rgb; }
        e = mix(fresh, history, h);
        gi_screen_history[out + 2u + g] = vec4f(e, 0.0);
    }
    gi_screen_history[out] = probe;
    gi_screen_history[out + 1u] = vec4f(n, frames + 1.0);
    textureStore(gi_screen_probe_out, tile, vec4f(probe.xyz, 1.0));
    textureStore(gi_screen_normal_out, tile, vec4f(n, 1.0));
    textureStore(gi_screen_irradiance_out, tile, vec4f(e, 1.0));
}

/** Guarda a vista-projeção e a posição da câmera ativa para o quadro seguinte (uma invocação). */
@compute @workgroup_size(1)
fn gi_screen_finish_main() {
    let cam = cameras[gi.screen.w];
    for (var c = 0u; c < 4u; c++) { gi_screen_history[c] = cam.viewProjection[c]; }
    gi_screen_history[4] = cam.position;
}
