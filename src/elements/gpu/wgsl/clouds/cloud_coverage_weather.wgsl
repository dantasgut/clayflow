// O mapa de cobertura pelo tempo (spec 041, R18): no lugar da função de cobertura, o estado do tempo da série (`weather`,
// a fatia do quadro: cobertura pedida, tipo, topo — a escala sinótica, trazida pelo vento local e relaxada) lido em cada
// texel do quadrado de cobertura, e as células de cúmulos (os campos da cobertura e do tipo, no referencial do vento de
// condução, como sem o tempo) sobre ele. O canal A é a fração de altura do topo das nuvens na casca (a torre do
// cúmulo-nimbo até a tropopausa, o cúmulo raso sob a inversão da alta). Perto da borda do quadrado o tempo cede ao tempo
// bom (o que a densidade usa fora do mapa), sem costura.
// Despacho linear: um texel por invocação.
// Requer: WORKGROUP_SIZE, clouds, cameras, cloud_coverage_field, cloud_weather_grid, cloud_weather_now, cloud_coverage_out.

/** O estado do tempo em `xz` (bilinear pelos texels da fatia do quadro; o tempo bom fora do quadrado). */
fn cloud_weather_state(xz: vec2f, fair: vec3f) -> vec3f {
    let size = vec2i(textureDimensions(cloud_weather_now));
    let p = cloud_weather_uv(xz, cloud_weather_center_now()) * vec2f(size) - 0.5;
    if (any(p < vec2f(0.0)) || any(p > vec2f(size - 1))) { return fair; }
    let base = vec2i(floor(p));
    let f = p - floor(p);
    let top = min(base + 1, size - 1);
    let a = textureLoad(cloud_weather_now, base, 0).xyz;
    let b = textureLoad(cloud_weather_now, vec2i(top.x, base.y), 0).xyz;
    let c = textureLoad(cloud_weather_now, vec2i(base.x, top.y), 0).xyz;
    let d = textureLoad(cloud_weather_now, top, 0).xyz;
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

@compute @workgroup_size(WORKGROUP_SIZE)
fn cloud_coverage_weather_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let size = textureDimensions(cloud_coverage_out);
    let i = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    if (i >= size.x * size.y) { return; }
    let g = vec3u(i % size.x, i / size.x, 0u);
    let uv = (vec2f(g.xy) + 0.5) / vec2f(size) - 0.5;
    let xz = clouds.coverageMap.xy + uv * clouds.coverageMap.z;
    let fair = vec3f(clouds.layer.x, clouds.layer.y, clouds.weatherMap.x);
    let edge = smoothstep(0.4375, 0.5, max(abs(uv.x), abs(uv.y)));
    let s = mix(cloud_weather_state(xz, fair), fair, edge);
    let frame = xz - clouds.coverageOffset.xy;
    let v = vec4f(cloud_coverage_field(frame, s.x, s.y), cloud_type_field(frame, s.y), 1.0, s.z);
    textureStore(cloud_coverage_out, g.xy, clamp(select(vec4f(0.0, 0.0, 0.0, 1.0), v, v == v), vec4f(0.0), vec4f(1.0)));
}
