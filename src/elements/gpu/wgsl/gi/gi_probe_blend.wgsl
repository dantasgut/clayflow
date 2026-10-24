// Acúmulo dos raios nas sondas (spec 033, R5; DDGI): por texel dos mapas octaédricos das sondas atualizadas, a média
// dos raios do quadro ponderada pelo cosseno (irradiância de cada rebatimento, E/π), por um lóbulo estreito (radiância
// especular) ou pela potência 50 do cosseno (visibilidade: distância média e média do quadrado), misturada ao valor
// anterior pela histerese — 0 na sonda nova ou que mudou de célula (endereçamento circular), a adaptativa da sonda
// (`gi_response`: a de resposta quando a luz muda de verdade, sem disparar com o ruído dos raios). Os mapas vivem em buffers (half empacotado); a cópia
// para os atlas filtrados é `gi_probe_atlas`.
// Requer: WORKGROUP_SIZE, gi_common, gi_response, gi, gi_probes (escrita), gi_rays_read, gi_generations, gi_radiance_map,
// gi_visibility_map.

fn gi_blend_index(gid3: vec3u, nwg: vec3u) -> u32 {
    return gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
}

fn gi_pack_rgb(c: vec3f) -> vec2u {
    let v = clamp(c, vec3f(0.0), vec3f(65000.0));
    return vec2u(pack2x16float(v.rg), pack2x16float(vec2f(v.b, 1.0)));
}

/** A sonda recomeça o histórico (nova, ou outra célula de mundo pelo endereçamento circular)? */
fn gi_probe_reset(index: u32) -> bool {
    let s = gi_probes[index];
    return s.offset.w == GI_PROBE_NEW || any(s.coord.xyz != gi_probe_cell(index));
}

/** Rebatimentos no máximo (os da `GlobalIllumination`). */
const GI_BLEND_MAX_BOUNCES: u32 = 8u;

/**
 * Histerese da sonda no quadro (a mesma para todos os texels e rebatimentos): 0 ao recomeçar; senão a adaptativa
 * (`gi_response`) pelo maior canal da média dos raios do último rebatimento — a de resposta quando a luz muda de verdade.
 * O texel 0 grava o estado da resposta.
 */
fn gi_probe_hysteresis(index: u32, t: u32, value: f32) -> f32 {
    let reset = gi_probe_reset(index);
    let state = select(gi_probes[index].response, vec4f(0.0), reset);
    let response = gi_response(state, value, gi.tuning.x);
    if (t == 0u) { gi_probes[index].response = response.state; }
    return response.h;
}

@compute @workgroup_size(WORKGROUP_SIZE)
fn gi_blend_irradiance_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let i = gi_blend_index(gid3, nwg);
    let texels = GI_IRRADIANCE_TEXELS * GI_IRRADIANCE_TEXELS;
    if (i >= gi.rays.w * texels) { return; }
    let slot = i / texels;
    let t = i % texels;
    let index = (gi.rays.z + slot) % gi_probe_count();
    let dir = gi_texel_dir(vec2u(t % GI_IRRADIANCE_TEXELS, t / GI_IRRADIANCE_TEXELS), GI_IRRADIANCE_TEXELS);
    let rays = gi.rays.x;
    let bounces = min(gi.bounces.x, GI_BLEND_MAX_BOUNCES);
    let last = bounces - 1u;
    // Um passo pelos raios: todos os rebatimentos, a especular do último e o valor da resposta.
    var sums: array<vec3f, GI_BLEND_MAX_BOUNCES>;
    var wsum = 0.0;
    var spec = vec3f(0.0);
    var ssum = 0.0;
    var value = 0.0;
    var n = 0.0;
    for (var k = 0u; k < rays; k++) {
        let base = (slot * rays + k) * gi.bounces.x;
        let front = gi_rays[base].w >= 0.0;
        if (!front) { continue; }
        let c = dot(dir, gi_ray_dir(k));
        let w = max(c, 0.0);
        let ws = pow(w, 8.0);
        for (var b = 0u; b < bounces; b++) { sums[b] += gi_rays[base + b].rgb * w; }
        let l = gi_rays[base + last].rgb;
        spec += l * ws;
        ssum += ws;
        value += gi_response_value(l);
        n += 1.0;
        wsum += w;
    }
    let h = gi_probe_hysteresis(index, t, value / max(n, 1.0));
    let probes = gi_probe_count();
    for (var b = 0u; b < bounces; b++) {
        let at = (b * probes + index) * texels + t;
        let old = unpack_half_rgb(gi_generations[at]);
        let fresh = select(old, sums[b] / wsum, wsum > 0.0);
        gi_generations[at] = gi_pack_rgb(mix(fresh, old, h));
    }
    let sat = index * texels + t;
    let sold = unpack_half_rgb(gi_radiance_map[sat]);
    let svalue = select(sold, spec / ssum, ssum > 0.0);
    gi_radiance_map[sat] = gi_pack_rgb(mix(svalue, sold, h));
}

@compute @workgroup_size(WORKGROUP_SIZE)
fn gi_blend_visibility_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let i = gi_blend_index(gid3, nwg);
    let texels = GI_VISIBILITY_TEXELS * GI_VISIBILITY_TEXELS;
    if (i >= gi.rays.w * texels) { return; }
    let slot = i / texels;
    let t = i % texels;
    let index = (gi.rays.z + slot) % gi_probe_count();
    let dir = gi_texel_dir(vec2u(t % GI_VISIBILITY_TEXELS, t / GI_VISIBILITY_TEXELS), GI_VISIBILITY_TEXELS);
    let rays = gi.rays.x;
    let bounces = gi.bounces.x;
    let spacing = gi_cascade(gi_probe_local(index).w).w;
    // Distância limitada pela diagonal da célula: além dela a visibilidade não muda o peso.
    let limit = spacing * 1.75;
    var sum = vec2f(0.0);
    var wsum = 0.0;
    for (var k = 0u; k < rays; k++) {
        let r = gi_rays[(slot * rays + k) * bounces];
        let w = pow(max(dot(dir, gi_ray_dir(k)), 0.0), 50.0);
        let d = min(abs(r.w), limit);
        sum += vec2f(d, d * d) * w;
        wsum += w;
    }
    let old = unpack2x16float(gi_visibility_map[index * texels + t]);
    let value = select(old, sum / wsum, wsum > 0.0);
    let h = select(gi.tuning.x, 0.0, gi_probe_reset(index));
    gi_visibility_map[index * texels + t] = pack2x16float(mix(value, old, h));
}
