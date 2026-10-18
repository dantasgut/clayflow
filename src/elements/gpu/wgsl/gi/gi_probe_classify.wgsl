// Estado das sondas atualizadas (spec 033, R6; DDGI): com mais de um quarto dos raios na face de trás de algo, a sonda
// está dentro da geometria e é desligada (não pesa nos pontos sombreados); perto de uma parede, é deslocada para fora
// (relocação: afasta-se da face de trás mais próxima e da face da frente que fica a menos de um quarto do espaçamento),
// limitada a 45 % do espaçamento. Marca a célula de mundo atual (o histórico vale para ela).
// Requer: WORKGROUP_SIZE, gi_common, gi, gi_probes_write, gi_rays_read.

@compute @workgroup_size(WORKGROUP_SIZE)
fn gi_probe_classify_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let slot = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    if (slot >= gi.rays.w) { return; }
    let index = (gi.rays.z + slot) % gi_probe_count();
    let rays = gi.rays.x;
    let bounces = gi.bounces.x;
    let spacing = gi_cascade(gi_probe_local(index).w).w;
    let cell = gi_probe_cell(index);
    var state = gi_probes[index];
    if (any(state.coord.xyz != cell)) {
        // Célula nova: o deslocamento da célula anterior não vale.
        state.offset = vec4f(0.0, 0.0, 0.0, GI_PROBE_NEW);
    }
    var back = 0u;
    var closest_back = 1e30;
    var back_dir = vec3f(0.0);
    var closest_front = 1e30;
    var front_dir = vec3f(0.0);
    for (var k = 0u; k < rays; k++) {
        let d = gi_rays[(slot * rays + k) * bounces].w;
        let dir = gi_ray_dir(k);
        if (d < 0.0) {
            back++;
            // A distância da face de trás foi guardada × 0,2.
            let t = -d * 5.0;
            if (t < closest_back) { closest_back = t; back_dir = dir; }
        } else if (d < closest_front) {
            closest_front = d;
            front_dir = dir;
        }
    }
    var offset = state.offset.xyz;
    if (back > 0u && f32(back) / f32(rays) > 0.25) {
        // Dentro: tenta sair pela face de trás mais próxima; continua desligada até sair.
        offset += back_dir * (closest_back + spacing * 0.05);
    } else if (closest_front < spacing * 0.25) {
        offset -= front_dir * (spacing * 0.25 - closest_front);
    }
    let limit = spacing * 0.45;
    offset = clamp(offset, vec3f(-limit), vec3f(limit));
    let inside = back > 0u && f32(back) / f32(rays) > 0.25;
    state.offset = vec4f(offset, select(GI_PROBE_ACTIVE, GI_PROBE_INSIDE, inside));
    state.coord = vec4i(cell, state.coord.w);
    gi_probes[index] = state;
}
