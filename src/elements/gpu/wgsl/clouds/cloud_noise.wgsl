// Volumes de ruído das nuvens (spec 041, R3): a função de forma (ponto `cloud_shape`: o grafo de Perlin-Worley da
// biblioteca ou o do usuário) avaliada no centro de cada texel do volume periódico [0, 1)³ — a forma (128³) e o detalhe
// (32³) — e gravada em `rgba8unorm`. Resultado não finito vale 0; fora de [0, 1], saturado. Só quando a função muda.
// Despacho linear: um texel por invocação.
// Requer: WORKGROUP_SIZE, clouds, cloud_shape_at, cloud_shape_out, cloud_detail_out.

fn cloud_noise_value(p: vec3f) -> vec4f {
    let v = cloud_shape_at(p, clouds.flags.y);
    return clamp(select(vec4f(0.0), v, v == v), vec4f(0.0), vec4f(1.0));
}

@compute @workgroup_size(WORKGROUP_SIZE)
fn cloud_noise_shape_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let size = textureDimensions(cloud_shape_out);
    let i = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    if (i >= size.x * size.y * size.z) { return; }
    let g = vec3u(i % size.x, (i / size.x) % size.y, i / (size.x * size.y));
    textureStore(cloud_shape_out, g, cloud_noise_value((vec3f(g) + 0.5) / vec3f(size)));
}

@compute @workgroup_size(WORKGROUP_SIZE)
fn cloud_noise_detail_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let size = textureDimensions(cloud_detail_out);
    let i = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    if (i >= size.x * size.y * size.z) { return; }
    let g = vec3u(i % size.x, (i / size.x) % size.y, i / (size.x * size.y));
    textureStore(cloud_detail_out, g, cloud_noise_value((vec3f(g) + 0.5) / vec3f(size)));
}
