// Marcha principal das nuvens (spec 041, R1, R2, R10): no alvo reconstruído (¼ da tela, ½ × ½; no perfil baixo 1/16,
// ¼ × ¼ — `cloud_march_scale`), um pixel de cada bloco 2 × 2 por
// quadro na ordem de Bayer (`clouds.march.z`): o raio da câmera por um ponto do pixel que muda a cada marcha, até a
// superfície opaca mais próxima dos S × S pixels da tela que ele cobre (a profundidade da cena depois da água), com o
// deslocamento inicial por ruído azul no tempo (sequência R2 por pixel). A nuvem sai com a perspectiva aérea até a profundidade dela:
// `Sc = L·Ta(dc) + (1 − Tc)·Sa(dc)`. Uma invocação por bloco; saídas `cloud_trace_out` (rgb, a = Tc) e
// `cloud_trace_depth_out` (r: a profundidade da nuvem, m, 0 sem nuvem; g: a distância da superfície até onde o pixel
// marchado foi — a reconstrução e o aumento só juntam valores da mesma superfície).
// Despacho linear: um bloco por invocação.
// Requer: WORKGROUP_SIZE, cloud_march_bayer, cloud_light, cloud_scene_limit, cloud_scene_depth, camera_space, sky_aerial_lookup, random, clouds, cameras,
// cloud_trace_out, cloud_trace_depth_out.

@compute @workgroup_size(WORKGROUP_SIZE)
fn cloud_march_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let blocks = textureDimensions(cloud_trace_out);
    let i = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    if (i >= blocks.x * blocks.y) { return; }
    let g = vec3u(i % blocks.x, i / blocks.x, 0u);
    let slot = clouds.march.w;
    let full = vec2f(cloud_scene_depth_size());
    let q = g.xy * 2u + cloud_bayer(clouds.march.z);
    // O raio num ponto do pixel de ¼ (os 2 × 2 da tela que ele cobre) que muda a cada vez que ele é marchado (sequência
    // R2 deslocada pelo hash do pixel): a média temporal integra a área do pixel, não só o centro dele (o detalhe menor
    // que o pixel de ¼, como a faixa de nuvens de 2–4 px rente ao horizonte, entra pela área que cobre).
    let k = f32(clouds.march.z / 4u);
    let hp = vec2f(f32(hash2(q + vec2u(7u, 13u)) >> 8u), f32(hash2(q + vec2u(29u, 3u)) >> 8u)) / 16777216.0;
    let sub = fract(hp + k * vec2f(0.7548776662, 0.5698402910));
    let scale = f32(cloud_march_scale());
    let center = (vec2f(q) + sub) * scale;
    let ray = camera_ray(slot, center, full);
    let limit = cloud_block_distance(slot, q);
    // Ruído azul no tempo: a sequência R2 deslocada pelo hash do pixel.
    let h = f32(hash2(q) >> 8u) / 16777216.0;
    let jitter = fract(h + f32(clouds.march.z) * 0.61803398875);
    // O ângulo do pixel da marcha (S pixels da tela): a pegada do detalhe.
    let pixel = length(camera_ray(slot, center + vec2f(scale, 0.0), full).dir - ray.dir);
    let s = cloud_integrate(ray.origin, ray.dir, limit, clouds.march.x, clouds.march.y, jitter, pixel);
    var color = s.scattered;
    if (s.transmittance < 1.0) {
        let aerial = sky_aerial(center / full, ray.dir, s.depth);
        color = color * aerial.transmittance + (1.0 - s.transmittance) * aerial.scattered * sky.sunIlluminance.rgb;
    }
    textureStore(cloud_trace_out, g.xy, vec4f(color, s.transmittance));
    textureStore(cloud_trace_depth_out, g.xy, vec4f(s.depth, min(limit, CLOUD_SKY_DISTANCE), 0.0, 0.0));
}
