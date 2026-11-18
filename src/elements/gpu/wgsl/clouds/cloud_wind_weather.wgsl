// O vento das nuvens pelo tempo (spec 041, R19): no lugar do vento uniforme da camada, o do quadrado do tempo
// (`weatherWind.xy`: o equilibrado com a pressão mais o de condução) no ponto; fora do quadrado, o de condução. Na faixa
// da bigorna, o vento da alta troposfera (`clouds.anvil.xy`), que a leva. Lido pela reconstrução temporal (onde a nuvem
// estava no quadro anterior) — o estado do tempo anda com ele.
// Requer: clouds, cloud_common, cloud_weather_grid, cloud_weather_wind_tex, cloud_clamp_sampler.

fn cloud_wind_at(p: vec3f) -> vec2f {
    let uv = cloud_weather_uv(p.xz, cloud_weather_center_now());
    var wind = clouds.wind.zw;
    if (all(uv >= vec2f(0.0)) && all(uv <= vec2f(1.0))) {
        wind = textureSampleLevel(cloud_weather_wind_tex, cloud_clamp_sampler, uv, 0.0).xy;
    }
    let floor = clouds.shell.z - CLOUD_ANVIL_CEILING - CLOUD_ANVIL_DEPTH;
    return mix(wind, clouds.anvil.xy, smoothstep(floor - 500.0, floor + 500.0, cloud_altitude(p)));
}
