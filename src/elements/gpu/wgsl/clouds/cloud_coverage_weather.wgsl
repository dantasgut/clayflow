// O mapa de cobertura pelo tempo (spec 041, R19): no lugar da função de cobertura, o estado do tempo da série (`weather`,
// a fatia do quadro: cobertura pedida, tipo, topo — a escala sinótica, trazida pelo vento local e relaxada) lido em cada
// texel do mapa de cobertura (em níveis por páginas, R21 rodada 19: o desenho e a escolha são os de `cloud_coverage_draw`), e as células de cúmulos (os campos da cobertura e do tipo, no referencial do vento de
// condução, como sem o tempo) sobre ele. O canal A é a fração de altura do topo das nuvens na casca (a torre do
// cúmulo-nimbo até a tropopausa, o cúmulo raso sob a inversão da alta). Perto da borda do quadrado do tempo (o lado do mapa) o tempo cede ao tempo
// bom (o que a densidade usa fora do mapa), sem costura. O canal B é a cobertura da bigorna (o quarto canal do estado).
// Requer: clouds, cloud_coverage_field, cloud_weather_grid, cloud_weather_now.

/** O estado do tempo em `xz` (bilinear pelos texels da fatia do quadro; o tempo bom, sem bigorna, fora do quadrado). */
fn cloud_weather_state(xz: vec2f, fair: vec4f) -> vec4f {
    let size = vec2i(textureDimensions(cloud_weather_now));
    let p = cloud_weather_uv(xz, cloud_weather_center_now()) * vec2f(size) - 0.5;
    if (any(p < vec2f(0.0)) || any(p > vec2f(size - 1))) { return fair; }
    let base = vec2i(floor(p));
    let f = p - floor(p);
    let top = min(base + 1, size - 1);
    let a = textureLoad(cloud_weather_now, base, 0);
    let b = textureLoad(cloud_weather_now, vec2i(top.x, base.y), 0);
    let c = textureLoad(cloud_weather_now, vec2i(base.x, top.y), 0);
    let d = textureLoad(cloud_weather_now, top, 0);
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

/** O valor do mapa no ponto `w` (m, referencial do vento): o `cloud_coverage_value` do kernel do tempo. */
fn cloud_coverage_weather_value(w: vec2f) -> vec4f {
    let xz = w + clouds.coverageOffset.xy;
    let c = abs(w - clouds.coverageMap.xy);
    let fair = vec4f(clouds.layer.x, clouds.layer.y, clouds.weatherMap.x, 0.0);
    let edge = smoothstep(0.4375, 0.5, max(c.x, c.y) / clouds.coverageMap.z);
    let s = mix(cloud_weather_state(xz, fair), fair, edge);
    let v = vec4f(cloud_coverage_field(w, s.x, s.y), cloud_type_field(w, s.y), s.w, s.z);
    return select(vec4f(0.0, 0.0, 0.0, 1.0), v, v == v);
}
