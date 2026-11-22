// O passe da luz das amostras da marcha da tela (spec 041, T074): uma amostra da lista do quadro por invocação
// (`cloud_light_list.wgsl`), por despacho indireto — a luz dela (`cloud_radiance`, com os passos de luz do perfil,
// `clouds.march.y`) × o peso na soma do raio, gravada no mesmo lugar da lista com a amostra anterior do raio
// (`cloud_light_list_out`), que a composição soma. O passe dos argumentos (`cloud_light_args_main`, uma invocação, depois
// da marcha) grava os grupos do despacho e a contagem da lista limitada ao teto (`cloud_light_args[4]`) e zera a
// contagem para a marcha do quadro seguinte.
// Despacho linear (como o `invocations` da C2): grupos em x até 65 535, o resto em y.
// Requer: WORKGROUP_SIZE, CLOUD_LIGHT_LIST_MAX, cloud_light, cloud_sun_volume_lookup (a pegada), clouds,
// cloud_light_list_a, cloud_light_list_b, cloud_light_list_out, cloud_light_args_read (a luz); cloud_light_args (os
// argumentos).

@compute @workgroup_size(WORKGROUP_SIZE)
fn cloud_light_samples_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let i = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    if (i >= cloud_light_args_read[4]) { return; }
    let size = textureDimensions(cloud_light_list_a);
    let at = vec2u(i % size.x, i / size.x);
    let a = textureLoad(cloud_light_list_a, at, 0);
    let b = textureLoad(cloud_light_list_b, at, 0);
    cloud_light_footprint = b.x;
    textureStore(cloud_light_list_out, at, vec4f(a.w * cloud_radiance(a.xyz, b.z, clouds.march.y, b.y), b.w));
}
