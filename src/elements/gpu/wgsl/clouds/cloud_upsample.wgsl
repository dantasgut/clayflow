// Aumento das nuvens para a tela (spec 041, R2): por pixel da tela, os 4 pixels vizinhos do alvo reconstruído (¼ da
// tela; 1/16 no perfil baixo)
// (bilinear) pesados pela semelhança da distância da superfície — a de cada um é a menor dos 2 × 2 pixels da tela que
// ele cobriu na marcha —: a nuvem não vaza para a frente da montanha nem some do céu ao lado dela.
// Despacho linear: um texel por invocação.
// Requer: WORKGROUP_SIZE, cloud_march_bayer (a escala), cloud_scene_depth, camera_space, clouds, cameras, cloud_march_now,
// cloud_view_out.

fn cloud_pixel_distance(slot: u32, px: vec2i, size: vec2f) -> f32 {
    let z = cloud_scene_depth(px);
    if (z >= 1.0) { return 1e7; }
    let cam = cameras[slot];
    let w = cam.inverseUnjitteredViewProjection * vec4f(pixel_to_ndc(vec2f(px) + 0.5, size), z, 1.0);
    return min(length(w.xyz / w.w - cam.position.xyz), 1e7);
}

@compute @workgroup_size(WORKGROUP_SIZE)
fn cloud_upsample_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let size = textureDimensions(cloud_view_out);
    let i = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    if (i >= size.x * size.y) { return; }
    let g = vec3u(i % size.x, i / size.x, 0u);
    let slot = clouds.march.w;
    let full = vec2f(size);
    let isize = vec2i(size);
    let quarter = vec2i(textureDimensions(cloud_march_now));
    let here = cloud_pixel_distance(slot, vec2i(g.xy), full);
    let scale = cloud_march_scale();
    let c = (vec2f(g.xy) + 0.5) / f32(scale) - 0.5;
    let base = vec2i(floor(c));
    let f = c - floor(c);
    var sum = vec4f(0.0);
    var weight = 0.0;
    for (var k = 0; k < 4; k++) {
        let o = vec2i(k & 1, k >> 1);
        let q = clamp(base + o, vec2i(0), quarter - 1);
        var d = 1e7;
        // A distância do texel: a menor de 2 × 2 pixels da tela dele (todos com a escala 2; a cada meio texel com 4 —
        // as quatro leituras por vizinho de sempre).
        let step = i32(scale) / 2;
        for (var j = 0; j < 4; j++) {
            let o = vec2i(j & 1, j >> 1) * step;
            d = min(d, cloud_pixel_distance(slot, min(q * i32(scale) + o, isize - 1), full));
        }
        let bil = select(1.0 - f.x, f.x, o.x == 1) * select(1.0 - f.y, f.y, o.y == 1);
        let w = max(bil, 1e-3) / (1e-2 + abs(d - here) / max(here, 1.0));
        sum += textureLoad(cloud_march_now, q, 0) * w;
        weight += w;
    }
    textureStore(cloud_view_out, g.xy, sum / max(weight, 1e-6));
}
