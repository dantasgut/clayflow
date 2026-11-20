// Marcha principal das nuvens (spec 041, R1, R2, R10): no alvo reconstruído (¼ da tela, ½ × ½; no perfil baixo 1/16,
// ¼ × ¼ — `cloud_march_scale`), um pixel de cada bloco 2 × 2 por
// quadro na ordem de Bayer (`clouds.march.z`): o raio da câmera por um ponto do pixel que muda a cada marcha, até a
// superfície opaca mais próxima dos S × S pixels da tela que ele cobre (a profundidade da cena depois da água), com o
// deslocamento inicial por ruído azul no tempo (sequência R2 por pixel). A nuvem sai com o que está na frente dela até a
// profundidade dela — os meios perto da câmera (`scene_near_fog`) e a perspectiva aérea além deles (spec 041, R21):
// `Sc = L·Tn·Ta(dc) + (1 − Tc)·(Sn + Tn·(Sa(dc) − Sa(alcance)))`. Uma invocação por bloco; saídas `cloud_trace_out` (rgb, a = Tc) e
// `cloud_trace_depth_out` (r: a profundidade da nuvem, m, 0 sem nuvem; g: a distância da superfície até onde o pixel
// marchado foi — a reconstrução e o aumento só juntam valores da mesma superfície).
// Despacho linear: um bloco por invocação.
// Requer: WORKGROUP_SIZE, cloud_march_bayer, cloud_light, cloud_scene_limit, cloud_scene_depth, camera_space, sky_aerial_lookup,
// scene_near_fog, random, clouds, cameras,
// cloud_trace_out, cloud_trace_depth_out.

/** O raio da câmera `slot` pelo ponto `px` (pixels da tela de `size`) sem o deslocamento do antisserrilhado temporal. */
fn cloud_ray_at(slot: u32, px: vec2f, size: vec2f) -> RayCamera {
    return camera_ray_ndc(slot, pixel_to_ndc(px, size) + cameras[slot].jitter.xy);
}

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
    // O raio sem o deslocamento do antisserrilhado temporal (`camera_ray` dá o da amostra deslocada; `cloud_ray_at`): o
    // texel guarda a média da área dele na tela sem o deslocamento, como a reprojeção do histórico a lê
    // (`cloud_previous_uv`). Com o raio deslocado ±½ pixel da tela a cada quadro, a área marchada andava com o
    // deslocamento e a faixa clara de 1–2 px rente ao horizonte (as nuvens a 40–70 km junto ao sol baixo) passava em parte
    // às linhas vizinhas: a linha dela −16 % de luz (`sunset`, região [3,3]: 5,8 → 4,4 %).
    let ray = cloud_ray_at(slot, center, full);
    let limit = cloud_block_distance(slot, q);
    // Ruído azul no tempo: a sequência R2 deslocada pelo hash do pixel.
    let h = f32(hash2(q) >> 8u) / 16777216.0;
    let jitter = fract(h + f32(clouds.march.z) * 0.61803398875);
    // O ângulo do pixel da marcha (S pixels da tela): a pegada do detalhe.
    let pixel = length(cloud_ray_at(slot, center + vec2f(scale, 0.0), full).dir - ray.dir);
    let s = cloud_integrate(ray.origin, ray.dir, limit, clouds.march.x, clouds.march.y, jitter, pixel);
    var color = s.scattered;
    if (s.transmittance < 1.0) {
        // O que está entre a câmera e a nuvem (spec 041, R21): os meios perto da câmera (os froxels: a névoa dos volumes
        // e, quando a grade a integra, a atmosfera até o fim dela, com as sombras do terreno e das nuvens) e a tabela da
        // perspectiva aérea só do fim deles até a nuvem (a diferença da luz espalhada dela) — a luz não é contada duas
        // vezes. Sem a atmosfera na grade, o alcance é 0 e fica a tabela inteira.
        let uv = center / full;
        let near = scene_near_fog(ray.origin + ray.dir * s.depth);
        let reach = min(near.reach, min(s.depth, SKY_AERIAL_RANGE * 1000.0));
        let aerial = sky_aerial(uv, ray.dir, s.depth);
        var front = near.fog.scattered;
        // A nuvem além do fim dos froxels: a tabela soma o trecho dele até ela (antes dele, nada a somar).
        if (reach < s.depth) {
            let start = sky_aerial(uv, ray.dir, reach);
            front += near.fog.transmittance * max(aerial.scattered - start.scattered, vec3f(0.0)) * sky.sunIlluminance.rgb;
        }
        color = color * near.fog.transmittance * aerial.transmittance + (1.0 - s.transmittance) * front;
    }
    textureStore(cloud_trace_out, g.xy, vec4f(color, s.transmittance));
    textureStore(cloud_trace_depth_out, g.xy, vec4f(s.depth, min(limit, CLOUD_SKY_DISTANCE), 0.0, 0.0));
}
