// Raios das sondas (spec 033, R2): por sonda atualizada no quadro e raio, o acerto pela estrutura de raios e a
// radiância que volta à sonda em cada rebatimento k (1..B): a emissão e a luz direta no ponto atingido (as luzes com
// raio de sombra; com muitas luzes, uma escolhida entre candidatas pelo peso) mais, de k ≥ 2, a irradiância do
// rebatimento k − 1 lida das sondas no ponto (`gi_generation_irradiance`). Raio que escapa: o ambiente da cena
// (`scene_environment`, o céu). Face de trás: distância negativa (a sonda está dentro da geometria) e sem luz.
// Requer: WORKGROUP_SIZE, gi_common, gi_weights, gi, ray_scene, gi_hit, gi_shade, scene_environment, gi_rays.

fn gi_trace_index(gid3: vec3u, nwg: vec3u) -> u32 {
    return gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
}

/** Posição de mundo de uma sonda (célula + deslocamento, lido da textura das sondas). */
fn gi_probe_world(index: u32) -> vec3f {
    let l = gi_probe_local(index);
    return gi_cell_position(gi_probe_cell(index), l.w) + gi_probe_texel(index).offset.xyz;
}

@compute @workgroup_size(WORKGROUP_SIZE)
fn gi_probe_trace_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let i = gi_trace_index(gid3, nwg);
    let rays = gi.rays.x;
    let updated = gi.rays.w;
    if (i >= updated * rays) { return; }
    let slot = i / rays;
    let k = i % rays;
    let index = (gi.rays.z + slot) % gi_probe_count();
    let bounces = gi.bounces.x;
    let out_base = (slot * rays + k) * bounces;
    let max_dist = gi.tuning.w;
    let origin = gi_probe_world(index);
    let dir = gi_ray_dir(k);
    let hit = ray_scene_hit(origin, dir, max_dist);
    if (hit.t >= max_dist) {
        let env = scene_environment(dir);
        for (var b = 0u; b < bounces; b++) { gi_rays[out_base + b] = vec4f(env, max_dist); }
        return;
    }
    if (hit.face < 0.0) {
        // Face de trás: a sonda vê o interior de um objeto — distância negativa marca, sem luz.
        for (var b = 0u; b < bounces; b++) { gi_rays[out_base + b] = vec4f(0.0, 0.0, 0.0, -hit.t * 0.2); }
        return;
    }
    let v = -dir;
    let c = gi_hit_closure(hit);
    let p = hit.position;
    let n = hit.normal;
    let direct = gi_shade_direct(c, p, n, v, i * 9781u + gi.rays.y * 6271u);
    gi_rays[out_base] = vec4f(direct, hit.t);
    for (var b = 1u; b < bounces; b++) {
        gi_rays[out_base + b] = vec4f(direct + gi_shade_indirect(c, p, n, v, b - 1u), hit.t);
    }
}
