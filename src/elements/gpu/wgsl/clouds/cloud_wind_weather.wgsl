// O vento das nuvens pelo tempo (spec 041, R19): no lugar do vento uniforme da camada, o do quadrado do tempo
// (`weatherWind.xy`: o equilibrado com a pressão mais o de condução) no ponto; fora do quadrado, o de condução. Lido pela
// reconstrução temporal (onde a nuvem estava no quadro anterior) — o estado do tempo anda com ele.
// Requer: clouds, cloud_weather_grid, cloud_weather_wind_tex, cloud_clamp_sampler.

fn cloud_wind_at(xz: vec2f) -> vec2f {
    let uv = cloud_weather_uv(xz, cloud_weather_center_now());
    if (any(uv < vec2f(0.0)) || any(uv > vec2f(1.0))) { return clouds.wind.zw; }
    return textureSampleLevel(cloud_weather_wind_tex, cloud_clamp_sampler, uv, 0.0).xy;
}
