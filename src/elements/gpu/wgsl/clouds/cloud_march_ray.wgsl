// O raio da marcha de um bloco 2 × 2 do alvo reconstruído no quadro (spec 041, R1, R2): o pixel do bloco na ordem de
// Bayer e o ponto dele por onde o raio passa. O mesmo na marcha e na composição dela (`cloud_march.wgsl`,
// `cloud_march_compose.wgsl`).
// Requer: cloud_march_bayer, cloud_scene_depth (o tamanho da tela), camera_space, random, clouds, cameras.

/** O raio da câmera `slot` pelo ponto `px` (pixels da tela de `size`) sem o deslocamento do antisserrilhado temporal. */
fn cloud_ray_at(slot: u32, px: vec2f, size: vec2f) -> RayCamera {
    return camera_ray_ndc(slot, pixel_to_ndc(px, size) + cameras[slot].jitter.xy);
}

struct CloudMarchRay {
    /** O pixel marchado do bloco no alvo reconstruído. */
    q: vec2u,
    /** O ponto do raio em pixels da tela. */
    center: vec2f,
    ray: RayCamera,
}

/** O raio do bloco `g` no quadro. */
fn cloud_march_ray(g: vec2u) -> CloudMarchRay {
    let slot = clouds.march.w;
    let full = vec2f(cloud_scene_depth_size());
    let q = g * 2u + cloud_bayer(clouds.march.z);
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
    return CloudMarchRay(q, center, ray);
}
