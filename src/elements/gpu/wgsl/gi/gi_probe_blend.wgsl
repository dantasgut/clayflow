// Acúmulo dos raios nas sondas (spec 033, R5; DDGI): por texel dos mapas octaédricos das sondas atualizadas, a média
// dos raios do quadro ponderada pelo cosseno (irradiância de cada rebatimento, E/π), por um lóbulo estreito (radiância
// especular) ou pela potência 50 do cosseno (visibilidade: distância média e média do quadrado), misturada ao valor
// anterior pela histerese — 0 na sonda nova ou que mudou de célula (endereçamento circular), menor quando a mudança do
// texel passa do limiar (resposta rápida a uma luz que acende). Os mapas vivem em buffers (half empacotado); a cópia
// para os atlas filtrados é `gi_probe_atlas`.
// Requer: WORKGROUP_SIZE, gi_common, gi, gi_probes, gi_rays_read, gi_generations, gi_radiance_map, gi_visibility_map.

fn gi_blend_index(gid3: vec3u, nwg: vec3u) -> u32 {
    return gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
}

fn gi_pack_rgb(c: vec3f) -> vec2u {
    let v = clamp(c, vec3f(0.0), vec3f(65000.0));
    return vec2u(pack2x16float(v.rg), pack2x16float(vec2f(v.b, 1.0)));
}

fn gi_unpack_rgb(p: vec2u) -> vec3f {
    return vec3f(unpack2x16float(p.x), unpack2x16float(p.y).x);
}

/** A sonda recomeça o histórico (nova, ou outra célula de mundo pelo endereçamento circular)? */
fn gi_probe_reset(index: u32) -> bool {
    let s = gi_probes[index];
    return s.offset.w == GI_PROBE_NEW || any(s.coord.xyz != gi_probe_cell(index));
}

/** Histerese do texel: 0 ao recomeçar; a de resposta quando a média nova se afasta muito da antiga. */
fn gi_hysteresis(reset: bool, old: vec3f, new_value: vec3f) -> f32 {
    if (reset) { return 0.0; }
    let lo = max(max(old.r, old.g), old.b);
    let hi = max(max(new_value.r, new_value.g), new_value.b);
    let change = abs(hi - lo) / max(max(lo, hi), 1e-4);
    // Mudança grande (luz acendeu, geometria mudou): histerese de resposta.
    return select(gi.tuning.x, f32(gi.bounces.z) * 0.001, change > 0.25);
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
    let bounces = gi.bounces.x;
    let reset = gi_probe_reset(index);
    let probes = gi_probe_count();
    for (var b = 0u; b < bounces; b++) {
        var sum = vec3f(0.0);
        var wsum = 0.0;
        var spec = vec3f(0.0);
        var ssum = 0.0;
        for (var k = 0u; k < rays; k++) {
            let r = gi_rays[(slot * rays + k) * bounces + b];
            if (r.w < 0.0) { continue; }
            let c = dot(dir, gi_ray_dir(k));
            let w = max(c, 0.0);
            sum += r.rgb * w;
            wsum += w;
            if (b + 1u == bounces) {
                let ws = pow(max(c, 0.0), 8.0);
                spec += r.rgb * ws;
                ssum += ws;
            }
        }
        let at = (b * probes + index) * texels + t;
        let old = gi_unpack_rgb(gi_generations[at]);
        let value = select(old, sum / wsum, wsum > 0.0);
        let h = gi_hysteresis(reset, old, value);
        gi_generations[at] = gi_pack_rgb(mix(value, old, h));
        if (b + 1u == bounces) {
            let sat = index * texels + t;
            let sold = gi_unpack_rgb(gi_radiance_map[sat]);
            let svalue = select(sold, spec / ssum, ssum > 0.0);
            gi_radiance_map[sat] = gi_pack_rgb(mix(svalue, sold, gi_hysteresis(reset, sold, svalue)));
        }
    }
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
