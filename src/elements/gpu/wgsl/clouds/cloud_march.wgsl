// Marcha principal das nuvens (spec 041, R1, R2, R10): no alvo reconstruído (¼ da tela, ½ × ½; no perfil baixo 1/16,
// ¼ × ¼ — `cloud_march_scale`), um pixel de cada bloco 2 × 2 por
// quadro na ordem de Bayer (`clouds.march.z`): o raio da câmera por um ponto do pixel que muda a cada marcha
// (`cloud_march_ray`), até a superfície opaca mais próxima dos S × S pixels da tela que ele cobre (a profundidade da cena
// depois da água), com o deslocamento inicial por ruído azul no tempo (sequência R2 por pixel). A luz das amostras com
// nuvem fica para o passe da luz (T074: a marcha as grava na lista do quadro, `cloud_light_list.wgsl`), e a composição
// (`cloud_march_compose.wgsl`) soma as do raio e põe na frente o que está entre a câmera e a nuvem. Uma invocação por
// bloco; saídas `cloud_ray_out` (rgb: a luz das amostras que não couberam na lista, calculada aqui; a = Tc) e
// `cloud_trace_depth_out` (r: a profundidade da nuvem, m, 0 sem nuvem; g: a distância da superfície até onde o pixel
// marchado foi — a reconstrução e o aumento só juntam valores da mesma superfície; b: a última amostra do raio na
// lista, −1 sem nenhuma).
// Despacho linear: um bloco por invocação.
// Requer: WORKGROUP_SIZE, cloud_march_ray, cloud_integrate, cloud_light_list, cloud_scene_limit, clouds,
// cloud_ray_out, cloud_trace_depth_out.

@compute @workgroup_size(WORKGROUP_SIZE)
fn cloud_march_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let blocks = textureDimensions(cloud_ray_out);
    let i = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    if (i >= blocks.x * blocks.y) { return; }
    let g = vec2u(i % blocks.x, i / blocks.x);
    let slot = clouds.march.w;
    let r = cloud_march_ray(g);
    let limit = cloud_block_distance(slot, r.q);
    // Ruído azul no tempo: a sequência R2 deslocada pelo hash do pixel.
    let h = f32(hash2(r.q) >> 8u) / 16777216.0;
    let jitter = fract(h + f32(clouds.march.z) * 0.61803398875);
    // O ângulo do pixel da marcha (S pixels da tela): a pegada do detalhe.
    let side = r.center + vec2f(f32(cloud_march_scale()), 0.0);
    let pixel = length(cloud_ray_at(slot, side, vec2f(cloud_scene_depth_size())).dir - r.ray.dir);
    let s = cloud_integrate(r.ray.origin, r.ray.dir, limit, clouds.march.x, clouds.march.y, jitter, pixel);
    textureStore(cloud_ray_out, g, vec4f(s.scattered, s.transmittance));
    textureStore(cloud_trace_depth_out, g, vec4f(s.depth, min(limit, CLOUD_SKY_DISTANCE), cloud_light_head, 0.0));
}
