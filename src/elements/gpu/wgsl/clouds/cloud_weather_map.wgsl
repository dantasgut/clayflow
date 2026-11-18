// O estado do tempo das nuvens (spec 041, R18), série temporal da 037 (`weather`: a fatia anterior lida pelo atraso 1, a
// do quadro escrita): em cada texel do quadrado do tempo, a pressão pela função de pressão (ponto `cloud_pressure`; o
// padrão de sistemas da biblioteca sem ela) no referencial que anda com o vento de condução, as derivadas pelo estêncil,
// o vento das nuvens (o equilibrado com o atrito da atmosfera livre, mais o de condução), a subida pela camada limite
// e a frente. O que o tempo dita (cobertura, tipo, topo) é o alvo; o estado de antes, trazido pelo vento das nuvens
// (semi-Lagrangiano: lido em `x − U·Δt` na fatia anterior), relaxa para ele com o tempo de formação τ:
// `s = alvo + (antes − alvo)·e^(−Δt/τ)` — as nuvens se formam e se desfazem em τ e andam com o vento local, girando em
// volta das baixas. Sem histórico (primeiro quadro, corte, fora da fatia anterior), o alvo. Ao lado, o vento das nuvens,
// a subida e a frente (`weatherWind`), lidos pela reconstrução temporal (a reprojeção pelo vento local) e pelos testes.
// Espelho de `weatherAt` e `weatherRelax` em `reference/cloudWeather.ts`.
// Despacho linear: um texel por invocação.
// Requer: WORKGROUP_SIZE, clouds, cameras, cloud_weather, cloud_weather_grid, cloud_weather_prev, cloud_weather_out,
// cloud_weather_wind_out.

/** A fatia anterior em `xz` (bilinear pelos texels; `w` < 0 fora dela). */
fn cloud_weather_before(xz: vec2f, center: vec2f) -> vec4f {
    let size = vec2i(textureDimensions(cloud_weather_prev));
    let p = cloud_weather_uv(xz, center) * vec2f(size) - 0.5;
    if (any(p < vec2f(0.0)) || any(p > vec2f(size - 1))) { return vec4f(-1.0); }
    let base = vec2i(floor(p));
    let f = p - floor(p);
    let top = min(base + 1, size - 1);
    let a = textureLoad(cloud_weather_prev, base, 0);
    let b = textureLoad(cloud_weather_prev, vec2i(top.x, base.y), 0);
    let c = textureLoad(cloud_weather_prev, vec2i(base.x, top.y), 0);
    let d = textureLoad(cloud_weather_prev, top, 0);
    return vec4f(mix(mix(a.xyz, b.xyz, f.x), mix(c.xyz, d.xyz, f.x), f.y), 1.0);
}

@compute @workgroup_size(WORKGROUP_SIZE)
fn cloud_weather_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let size = textureDimensions(cloud_weather_out);
    let i = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    if (i >= size.x * size.y) { return; }
    let g = vec2u(i % size.x, i / size.x);
    let center = cloud_weather_center_now();
    let xz = center + ((vec2f(g) + 0.5) / vec2f(size) - 0.5) * clouds.weatherMap.z;
    let time = clouds.coverageMap.w;
    let d = cloud_pressure_stencil(xz - clouds.coverageOffset.xy, time, clouds.weatherMap.w, clouds.weatherFlags.y);
    let q = clouds.weather;
    let balanced = cloud_balanced_wind(d, q.x, q.y);
    let wind = clouds.wind.zw + vec2f(balanced.x, -balanced.y);
    let w = cloud_ekman(d, q.x, q.z);
    let front = cloud_front(d, q.x, q.y);
    let goal = cloud_weather_clouds(w, front, vec3f(clouds.layer.x, clouds.layer.y, clouds.weatherMap.x));
    var state = goal;
    let cam = cameras[clouds.march.w];
    if (clouds.weatherFlags.z != 0u && cam.history.x < 0.5) {
        let dt = clouds.timing.x;
        let before = cloud_weather_before(xz - wind * dt, cloud_weather_center_before());
        if (before.w >= 0.0) { state = goal + (before.xyz - goal) * exp(-dt / q.w); }
    }
    textureStore(cloud_weather_out, g, vec4f(state, 1.0));
    textureStore(cloud_weather_wind_out, g, vec4f(wind, w, front));
}
