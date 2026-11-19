// Aumento das nuvens para a tela (spec 041, R2): por pixel da tela, os 4 pixels vizinhos do alvo reconstruído (¼ da
// tela; 1/16 no perfil baixo)
// (bilinear) pesados pela semelhança da distância da superfície — a do pixel da tela contra a superfície até onde o valor
// de cada texel foi marchado (`cloud_march_depth_now.g`, a menor dos pixels da tela que ele cobre) —: a nuvem não vaza
// para a frente da montanha nem some do céu ao lado dela.
// Despacho linear: um texel por invocação.
// Requer: WORKGROUP_SIZE, cloud_common, cloud_scene_limit, cloud_scene_depth, camera_space, clouds, cameras, cloud_march_now,
// cloud_march_depth_now, cloud_view_out.

fn cloud_pixel_distance(slot: u32, px: vec2i, size: vec2f) -> f32 {
    return min(cloud_surface_distance(slot, px, size), CLOUD_SKY_DISTANCE);
}

@compute @workgroup_size(WORKGROUP_SIZE)
fn cloud_upsample_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let size = textureDimensions(cloud_view_out);
    let i = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    if (i >= size.x * size.y) { return; }
    let g = vec3u(i % size.x, i / size.x, 0u);
    let slot = clouds.march.w;
    let full = vec2f(size);
    let quarter = vec2i(textureDimensions(cloud_march_now));
    let here = cloud_pixel_distance(slot, vec2i(g.xy), full);
    // A superfície do pixel mais perto que a casca: nenhuma nuvem na frente dela (sem ler o alvo reconstruído).
    if (here < cloud_shell_nearest(cameras[slot].position.xyz)) {
        textureStore(cloud_view_out, g.xy, vec4f(0.0, 0.0, 0.0, 1.0));
        return;
    }
    let scale = cloud_march_scale();
    let c = (vec2f(g.xy) + 0.5) / f32(scale) - 0.5;
    let base = vec2i(floor(c));
    let f = c - floor(c);
    var sum = vec4f(0.0);
    var weight = 0.0;
    for (var k = 0; k < 4; k++) {
        let o = vec2i(k & 1, k >> 1);
        let q = clamp(base + o, vec2i(0), quarter - 1);
        // A superfície até onde o valor do texel foi marchado (a reconstrução a guarda com ele).
        let d = textureLoad(cloud_march_depth_now, q, 0).g;
        let bil = select(1.0 - f.x, f.x, o.x == 1) * select(1.0 - f.y, f.y, o.y == 1);
        let w = max(bil, 1e-3) / (1e-2 + abs(d - here) / max(here, 1.0));
        sum += textureLoad(cloud_march_now, q, 0) * w;
        weight += w;
    }
    textureStore(cloud_view_out, g.xy, sum / max(weight, 1e-6));
}
