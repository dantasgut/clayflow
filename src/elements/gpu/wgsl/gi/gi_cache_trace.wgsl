// Raios do cache de irradiância nas superfícies (spec 034, T059): por célula da lista do quadro (`gi_cache_select_main`),
// `gi.cache.z` raios em cosseno a partir do ponto da célula, na rodada da onda entre os raios das sondas do mundo e os
// das de tela (`gi_wave_cache_first`). No acerto, como nos raios das sondas de tela: a luz direta e a emissão (g = 0)
// mais, de g ≥ 1, a irradiância da geração g − 1 no ponto atingido pelo próprio cache (`gi_bounce_at`: a célula do
// acerto, criada se falta; sem acúmulo ainda, as sondas de tela e as do mundo). Grava a média de L · π (o peso do
// cosseno) de cada geração por célula, que `gi_cache_blend_main` acumula.
// Requer: gi_screen_trace (e o que ela requer), basis, sampling, gi_surface_cache, gi_cache, gi_cache_list_read,
// gi_cache_fresh.

/** O raio `j` do cache no quadro: a posição na lista, o raio da célula e a célula (NONE fora da lista). */
struct GiCacheRay {
    slot: u32,
    k: u32,
    cell: u32,
}

fn gi_cache_ray(j: u32) -> GiCacheRay {
    let slot = j / gi.cache.z;
    var cell = NONE;
    if (slot < gi_cache_listed()) { cell = gi_cache_list_read[1u + slot]; }
    return GiCacheRay(slot, j % gi.cache.z, cell);
}

/** O ponto e a normal da célula. */
fn gi_cache_point(cell: u32) -> vec3f {
    let at = gi_cache_at(cell, 4u);
    return bitcast<vec3f>(vec3u(atomicLoad(&gi_cache[at]), atomicLoad(&gi_cache[at + 1u]), atomicLoad(&gi_cache[at + 2u])));
}

fn gi_cache_normal(cell: u32) -> vec3f {
    return gi_oct_decode(unpack2x16snorm(atomicLoad(&gi_cache[gi_cache_at(cell, 3u)])));
}

/**
 * Direção do raio `k` da célula no quadro: cosseno pela sequência R2 deslocada por célula e quadro (os `gi.cache.z`
 * raios cobrem o hemisfério por igual; o deslocamento muda a cada quadro). Peso cos / pdf = π.
 */
fn gi_cache_dir(cell: u32, k: u32, n: vec3f) -> vec3f {
    let h = random_seed(RANDOM_STREAM_GI_CACHE, cell, gi.rays.y);
    let shift = vec2f(f32(h & 0xFFFFu), f32(h >> 16u)) / 65536.0;
    let u = fract(vec2f(0.7548776662, 0.5698402910) * f32(k + 1u) + shift);
    return normalize(basis_duff(n) * sample_cosine(u));
}

/**
 * A origem do raio `k` da célula no quadro: um ponto sorteado no quadrado da célula no plano do ponto dela (o centro da
 * célula projetado no plano, ± meio lado nos dois eixos da superfície) — a célula guarda a média da irradiância na área
 * dela, não a de um ponto: o ponto que a criou, perto da base de um objeto ou de uma quina, deixava a célula inteira
 * mais clara ou mais escura que a média que os acertos nela leem.
 */
fn gi_cache_origin(cell: u32, k: u32, n: vec3f) -> vec3f {
    let p = gi_cache_point(cell);
    let size = bitcast<f32>(atomicLoad(&gi_cache[gi_cache_at(cell, 7u)]));
    let center = (floor(p / size) + 0.5) * size;
    let q = center - n * dot(center - p, n);
    let h = random_seed(RANDOM_STREAM_GI_CACHE, cell ^ 0x68bc21ebu, gi.rays.y * 64u + k);
    let t = vec2f(f32(h & 0xFFFFu), f32(h >> 16u)) / 65536.0 - 0.5;
    let b = basis_duff(n);
    return q + (b[0] * t.x + b[1] * t.y) * size;
}

/** O acerto de cada raio do cache na onda (o material fora do traçado, spec 039). */
@compute @workgroup_size(WORKGROUP_SIZE)
fn gi_cache_hit_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let j = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    if (j >= gi.cache.y * gi.cache.z) { return; }
    let w = gi_wave_cache_first() + j;
    let r = gi_cache_ray(j);
    if (r.cell == NONE) {
        ray_wave_put_empty(w, vec4f(0.0, 0.0, 0.0, -1.0));
        gi_wave_scatter_put(w, vec3f(0.0), vec3f(0.0, 1.0, 0.0), 0.0);
        return;
    }
    let n = gi_cache_normal(r.cell);
    let p = gi_cache_origin(r.cell, r.k, n);
    // Afasta a origem da superfície em proporção à distância da origem do mundo (a precisão do acerto).
    let origin = p + n * (1e-3 + length(p) * 1e-4);
    let max_dist = gi.tuning.w;
    let dir = gi_cache_dir(r.cell, r.k, n);
    let hit = ray_scene_hit(origin, dir, max_dist);
    // A transmitância dos volumes do trecho é de `gi_wave_through_main`, que multiplica a carga.
    let through = vec3f(1.0);
    gi_wave_scatter_put(w, origin, dir, select(min(hit.t, max_dist), 0.0, hit.face < 0.0 && hit.t < max_dist));
    if (hit.t >= max_dist || hit.face < 0.0) {
        ray_wave_put_empty(w, vec4f(through, select(-1.0, max_dist, hit.t >= max_dist)));
        return;
    }
    let s = ray_hit_surface(hit, gi.extra.w, 0.0);
    ray_wave_put_surface(w, s.index, s.slot, s.sample.world_position, s.sample.normal, s.sample.uv, gi.extra.w, 0.0,
        0.0, s.material, vec4f(through, hit.t));
    ray_wave_tag(w, pack2x16snorm(gi_oct_encode(dir)));
}

/** A irradiância de cada geração que volta por um raio, por invocação (a soma por célula é do grupo). */
var<workgroup> gi_cache_partial: array<vec4f, WORKGROUP_SIZE * GI_SCREEN_MAX_BOUNCES>;

/**
 * Uma invocação por raio (os raios de uma célula no mesmo grupo: `gi.cache.z` divide o grupo); a primeira de cada célula
 * soma os raios dela e grava a média de L · π de cada geração (w: a fração dos raios na média — a face de trás fica
 * fora).
 */
@compute @workgroup_size(WORKGROUP_SIZE)
fn gi_cache_trace_main(
    @builtin(global_invocation_id) gid3: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
    @builtin(local_invocation_index) lid: u32,
) {
    let j = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    let rays = gi.cache.z;
    let r = gi_cache_ray(j);
    let bounces = min(gi.bounces.x, GI_SCREEN_MAX_BOUNCES);
    var sums: array<vec3f, GI_SCREEN_MAX_BOUNCES>;
    var counted = 0.0;
    if (j < gi.cache.y * rays && r.cell != NONE) {
        let max_dist = gi.tuning.w;
        let wi = gi_wave_cache_first() + j;
        let traced = ray_wave_entries[wi].hit.payload;
        let scatter = gi_wave_light_read[4u * wi + 3u];
        let through = traced.rgb;
        if (traced.w >= 0.0) { counted = 1.0; }
        if (traced.w >= max_dist) {
            let dir = gi_cache_dir(r.cell, r.k, gi_cache_normal(r.cell));
            let env = gi_through(scene_environment(dir), through, scatter) * PI;
            for (var g = 0u; g < bounces; g++) { sums[g] = env; }
        } else if (traced.w >= 0.0) {
            let h = ray_wave_entries[wi].hit;
            let v = -gi_oct_decode(unpack2x16snorm(h.ray));
            let lit = gi_wave_light_read[4u * wi];
            let direct = lit.rgb;
            let f = GiShadeFactors(gi_wave_light_read[4u * wi + 1u].rgb, gi_wave_light_read[4u * wi + 2u].rgb, lit.w > 0.0);
            sums[0] = gi_through(direct, through, scatter) * PI;
            if (bounces > 1u) {
                let b = gi_bounce_at(f, h.position, h.normal, v, traced.w, false);
                for (var g = 1u; g < bounces; g++) {
                    sums[g] = gi_through(direct + gi_screen_bounce(f, h.position, h.normal, v, traced.w, g - 1u, b), through,
                        scatter) * PI;
                }
            }
        }
    }
    for (var g = 0u; g < bounces; g++) {
        gi_cache_partial[lid * GI_SCREEN_MAX_BOUNCES + g] = vec4f(sums[g], counted);
    }
    workgroupBarrier();
    if (r.cell == NONE || r.k != 0u || j >= gi.cache.y * rays) { return; }
    for (var g = 0u; g < bounces; g++) {
        var total = vec4f(0.0);
        for (var q = 0u; q < rays; q++) { total += gi_cache_partial[(lid + q) * GI_SCREEN_MAX_BOUNCES + g]; }
        gi_cache_fresh[r.slot * gi.bounces.x + g] = vec4f(total.rgb / max(total.w, 1.0), total.w / f32(rays));
    }
}
