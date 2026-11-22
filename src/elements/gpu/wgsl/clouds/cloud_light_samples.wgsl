// O passe da luz das amostras da marcha da tela (spec 041, T074): uma amostra da lista do quadro por invocação
// (`cloud_light_list.wgsl`), por despacho indireto. A amostra guarda a distância no raio, o peso na soma do raio, a coluna
// do ambiente e o raio dela; o ponto, a pegada do pixel e o cosseno com o sol saem do raio relido (`cloud_march_ray`, o
// mesmo da marcha no quadro). A luz dela (`cloud_radiance`, com os passos de luz do perfil, `clouds.march.y`) × o peso é
// gravada no lugar das três primeiras palavras da amostra (`cloud_light_list_rw`, leitura e escrita), que a composição
// soma. O passe dos argumentos (`cloud_light_args_main`, uma invocação, depois da marcha) grava os grupos do despacho e a
// contagem da lista limitada ao teto (`cloud_light_args[4]`) e zera a contagem para a marcha do quadro seguinte.
// Despacho linear (como o `invocations` da C2): grupos em x até 65 535, o resto em y.
// Requer: WORKGROUP_SIZE, CLOUD_LIGHT_LINK, cloud_march_ray, cloud_light, cloud_sun_volume_lookup (a pegada), sky, clouds,
// cloud_light_list_rw, cloud_light_args_read.

@compute @workgroup_size(WORKGROUP_SIZE)
fn cloud_light_samples_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let i = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    if (i >= cloud_light_args_read[4]) { return; }
    let size = textureDimensions(cloud_light_list_rw);
    let at = vec2u(i % size.x, i / size.x);
    let t = bitcast<f32>(textureLoad(cloud_light_list_rw, at, 0u).r);
    let weight = bitcast<f32>(textureLoad(cloud_light_list_rw, at, 1u).r);
    let occ = bitcast<f32>(textureLoad(cloud_light_list_rw, at, 2u).r);
    let ray = textureLoad(cloud_light_list_rw, at, 3u).r;
    // O lugar que guarda o trecho anterior do raio não é amostra.
    if (ray == CLOUD_LIGHT_LINK) { return; }
    let r = cloud_march_ray(vec2u(ray & 0xffffu, ray >> 16u));
    cloud_light_footprint = t * cloud_march_pixel(r);
    let cos_theta = dot(r.ray.dir, sky.sunDirection.xyz);
    let light = weight * cloud_radiance(r.ray.origin + r.ray.dir * t, cos_theta, clouds.march.y, occ);
    textureStore(cloud_light_list_rw, at, 0u, vec4u(bitcast<u32>(light.r), 0u, 0u, 0u));
    textureStore(cloud_light_list_rw, at, 1u, vec4u(bitcast<u32>(light.g), 0u, 0u, 0u));
    textureStore(cloud_light_list_rw, at, 2u, vec4u(bitcast<u32>(light.b), 0u, 0u, 0u));
}
