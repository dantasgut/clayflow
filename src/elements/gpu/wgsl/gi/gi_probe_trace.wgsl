// Raios das sondas (spec 033, R2): por sonda atualizada no quadro e raio, o acerto pela estrutura de raios e a
// radiância que volta à sonda em cada rebatimento k (1..B): a emissão e a luz direta no ponto atingido (as luzes com
// raio de sombra; com muitas luzes, uma escolhida entre candidatas pelo peso) mais, de k ≥ 2, a irradiância do
// rebatimento k − 1 no ponto: a das sondas de tela do quadro anterior quando o ponto é uma superfície visível
// (`gi_screen_history_taps`, exata de perto), a das sondas do mundo (`gi_generation_irradiance`) quando não. Raio que escapa: o ambiente da cena
// (`scene_environment`, o céu). Face de trás: distância negativa (a sonda está dentro da geometria) e sem luz.
// O material no ponto atingido é avaliado fora do traçado (spec 039): `gi_probe_hit_main` grava o acerto na onda e
// `gi_probe_trace_main` lê o fechamento dela.
// Requer: WORKGROUP_SIZE, gi_common, gi_weights, gi, ray_scene, ray_hit, ray_wave, gi_shade, gi_screen_reproject,
// closure_eval, scene_environment, ray_volume_transmittance, gi_rays.

fn gi_trace_index(gid3: vec3u, nwg: vec3u) -> u32 {
    return gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
}

/** Posição de mundo de uma sonda (célula + deslocamento, lido da textura das sondas). */
fn gi_probe_world(index: u32) -> vec3f {
    let l = gi_probe_local(index);
    return gi_cell_position(gi_probe_cell(index), l.w) + gi_probe_texel(index).offset.xyz;
}

/** O raio `i` das sondas do quadro: a sonda (o slot e o índice dela), o raio da sonda e a saída. */
struct GiProbeRay {
    slot: u32,
    k: u32,
    index: u32,
    out_base: u32,
}

fn gi_probe_ray(i: u32) -> GiProbeRay {
    let rays = gi.rays.x;
    let slot = i / rays;
    let k = i % rays;
    return GiProbeRay(slot, k, (gi.rays.z + slot) % gi_probe_count(), (slot * rays + k) * gi.bounces.x);
}

/**
 * O acerto de cada raio das sondas (spec 039: o material fora do traçado): a transmitância dos volumes e a distância na
 * carga da onda (negativa na face de trás; a distância máxima no escape) e, na face da frente, o acerto na onda.
 */
@compute @workgroup_size(WORKGROUP_SIZE)
fn gi_probe_hit_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let i = gi_trace_index(gid3, nwg);
    if (i >= gi.rays.w * gi.rays.x) { return; }
    let r = gi_probe_ray(i);
    let max_dist = gi.tuning.w;
    let origin = gi_probe_world(r.index);
    let dir = gi_ray_dir(r.k);
    let hit = ray_scene_hit(origin, dir, max_dist);
    // Os volumes atravessados (a água) atenuam o que o raio traz.
    let through = ray_volume_transmittance(origin, dir, min(hit.t, max_dist), gi.extra.w);
    if (hit.t >= max_dist) {
        ray_wave_put_empty(i, vec4f(through, max_dist));
        return;
    }
    if (hit.face < 0.0) {
        ray_wave_put_empty(i, vec4f(through, -max(hit.t, 1e-30)));
        return;
    }
    let s = ray_hit_surface(hit, gi.extra.w, 0.0);
    ray_wave_put_surface(i, s.index, s.slot, s.sample.world_position, s.sample.normal, s.sample.uv, gi.extra.w, 0.0,
        0.0, s.material, vec4f(through, hit.t));
}

/** A radiância de cada rebatimento que volta por raio, pelo acerto e pelo fechamento avaliado na onda. */
@compute @workgroup_size(WORKGROUP_SIZE)
fn gi_probe_trace_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let i = gi_trace_index(gid3, nwg);
    if (i >= gi.rays.w * gi.rays.x) { return; }
    let r = gi_probe_ray(i);
    let bounces = gi.bounces.x;
    let out_base = r.out_base;
    let max_dist = gi.tuning.w;
    let dir = gi_ray_dir(r.k);
    let traced = ray_wave_entries[i].hit.payload;
    let through = traced.rgb;
    if (traced.w >= max_dist) {
        let env = scene_environment(dir) * through;
        for (var b = 0u; b < bounces; b++) { gi_rays[out_base + b] = vec4f(env, max_dist); }
        return;
    }
    if (traced.w < 0.0) {
        // Face de trás: a sonda vê o interior de um objeto — distância negativa marca, sem luz.
        for (var b = 0u; b < bounces; b++) { gi_rays[out_base + b] = vec4f(0.0, 0.0, 0.0, traced.w * 0.2); }
        return;
    }
    let v = -dir;
    let c = ray_wave_entries[i].closure;
    let h = ray_wave_entries[i].hit;
    let p = h.position;
    let n = h.normal;
    let direct = gi_shade_direct(c, p, n, v, random_seed(RANDOM_STREAM_GI_WORLD, i, gi.rays.y));
    gi_rays[out_base] = vec4f(direct * through, traced.w);
    if (bounces < 2u) { return; }
    // Acerto numa superfície visível: o rebatimento anterior das sondas de tela (exato de perto); senão, das do mundo.
    let taps = gi_screen_history_taps(p, n);
    let screen = gi_screen_history_found(taps) && c.translucent_weight <= 0.0;
    // Os pesos das sondas do mundo uma vez para todas as gerações.
    var w: GiGenerationWeights;
    if (!screen) { w = gi_generation_weights(p, n, v); }
    for (var b = 1u; b < bounces; b++) {
        var indirect = vec3f(0.0);
        if (screen) {
            let e = gi_screen_history_gather(taps, GI_SCREEN_HISTORY_GENERATIONS + b - 1u).rgb / PI;
            indirect = closure_indirect(c, n, v, IndirectLight(e, e, e, e, e));
        } else {
            indirect = gi_shade_indirect_weighted(c, p, n, v, w, b - 1u);
        }
        gi_rays[out_base + b] = vec4f((direct + indirect) * through, traced.w);
    }
}
