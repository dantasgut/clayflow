// Mapa de cobertura (spec 041, R4): o quadrado centrado na câmera (`clouds.coverageMap`: centro, lado, tempo) pela
// função de cobertura (ponto `cloud_coverage`: cobertura, tipo e densidade relativa no ponto horizontal do referencial
// que anda com o vento, no tempo simulado; sem função, os valores globais da camada). Inteiro a cada quadro.
// Despacho linear: um texel por invocação.
// Requer: WORKGROUP_SIZE, clouds, cloud_coverage_fn_at, cloud_coverage_out.

@compute @workgroup_size(WORKGROUP_SIZE)
fn cloud_coverage_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let size = textureDimensions(cloud_coverage_out);
    let i = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    if (i >= size.x * size.y) { return; }
    let g = vec3u(i % size.x, i / size.x, 0u);
    let uv = (vec2f(g.xy) + 0.5) / vec2f(size) - 0.5;
    let xz = clouds.coverageMap.xy + uv * clouds.coverageMap.z;
    let v = cloud_coverage_fn_at(xz - clouds.coverageOffset.xy, clouds.coverageMap.w, clouds.flags.z);
    let ok = select(vec3f(0.0), v, v == v);
    textureStore(cloud_coverage_out, g.xy, vec4f(clamp(ok, vec3f(0.0), vec3f(1.0)), 1.0));
}
