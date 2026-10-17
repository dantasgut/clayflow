// Cópia dos mapas das sondas atualizadas para os atlas filtrados (spec 033, R2): cada ladrilho com a borda de um texel
// que repete o octaedro do outro lado (a filtragem bilinear do hardware atravessa as dobras sem costura). O atlas de
// irradiância recebe o último rebatimento (o que o desenho lê), o de radiância o mapa especular e o de visibilidade a
// distância média e a média do quadrado.
// Também o estado das sondas atualizadas na textura das sondas (o que o desenho e os raios leem).
// Requer: WORKGROUP_SIZE, gi_common, gi, gi_probes, gi_generations_read, gi_radiance_map_read, gi_visibility_map_read,
// gi_irradiance_out, gi_radiance_out, gi_visibility_out, gi_probe_out.

/** Texel interior que alimenta o texel (x, y) de um ladrilho de `n` + 2 (a borda espelha o lado oposto). */
fn gi_border_source(xy: vec2u, n: u32) -> vec2u {
    let x = i32(xy.x) - 1;
    let y = i32(xy.y) - 1;
    let m = i32(n) - 1;
    var sx = x;
    var sy = y;
    let left = x < 0;
    let right = x > m;
    let top = y < 0;
    let bottom = y > m;
    if ((left || right) && (top || bottom)) {
        // Cantos: o canto oposto.
        sx = select(0, m, left);
        sy = select(0, m, top);
    } else if (top || bottom) {
        sx = m - x;
        sy = select(m, 0, top);
    } else if (left || right) {
        sx = select(m, 0, left);
        sy = m - y;
    }
    return vec2u(u32(sx), u32(sy));
}

fn gi_atlas_index(gid3: vec3u, nwg: vec3u) -> u32 {
    return gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
}

fn gi_unpack(p: vec2u) -> vec3f {
    return vec3f(unpack2x16float(p.x), unpack2x16float(p.y).x);
}

@compute @workgroup_size(WORKGROUP_SIZE)
fn gi_atlas_irradiance_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let i = gi_atlas_index(gid3, nwg);
    let n = GI_IRRADIANCE_TEXELS;
    let tile = n + 2u;
    if (i >= gi.rays.w * tile * tile) { return; }
    let slot = i / (tile * tile);
    let t = i % (tile * tile);
    let xy = vec2u(t % tile, t / tile);
    let index = (gi.rays.z + slot) % gi_probe_count();
    let src = gi_border_source(xy, n);
    let texel = src.x + src.y * n;
    let last = gi.bounces.x - 1u;
    let e = gi_unpack(gi_generations[(last * gi_probe_count() + index) * n * n + texel]);
    let s = gi_unpack(gi_radiance_map[index * n * n + texel]);
    let at = gi_atlas_tile(index, n) + xy;
    textureStore(gi_irradiance_out, at, vec4f(e, 1.0));
    textureStore(gi_radiance_out, at, vec4f(s, 1.0));
}

@compute @workgroup_size(WORKGROUP_SIZE)
fn gi_atlas_visibility_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let i = gi_atlas_index(gid3, nwg);
    let n = GI_VISIBILITY_TEXELS;
    let tile = n + 2u;
    if (i >= gi.rays.w * tile * tile) { return; }
    let slot = i / (tile * tile);
    let t = i % (tile * tile);
    let xy = vec2u(t % tile, t / tile);
    let index = (gi.rays.z + slot) % gi_probe_count();
    let src = gi_border_source(xy, n);
    let m = unpack2x16float(gi_visibility_map[index * n * n + src.x + src.y * n]);
    textureStore(gi_visibility_out, gi_atlas_tile(index, n) + xy, vec4f(m, 0.0, 1.0));
}

@compute @workgroup_size(WORKGROUP_SIZE)
fn gi_atlas_probes_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let slot = gi_atlas_index(gid3, nwg);
    if (slot >= gi.rays.w) { return; }
    let index = (gi.rays.z + slot) % gi_probe_count();
    let s = gi_probes[index];
    let x = (index % GI_PROBE_TEXTURE_ROW) * 2u;
    let y = index / GI_PROBE_TEXTURE_ROW;
    textureStore(gi_probe_out, vec2u(x, y), s.offset);
    textureStore(gi_probe_out, vec2u(x + 1u, y), vec4f(vec3f(gi_cell_wrap(s.coord.xyz)), 1.0));
}
