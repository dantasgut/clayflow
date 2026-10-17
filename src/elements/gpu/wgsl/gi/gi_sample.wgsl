// Luz indireta das sondas num ponto (spec 033, R7): a irradiância (difusa) na normal e a radiância especular na direção
// refletida, lidas dos atlas filtrados das sondas com os pesos de `gi_weights`, misturando as cascatas na borda.
// Requer: gi_common, gi_weights, gi, gi_irradiance_atlas, gi_radiance_atlas, gi_sampler.

/** Irradiância (E, W/m² na escala da cena) no ponto `p` com normal `n`, vista `v`. */
fn gi_irradiance(p: vec3f, n: vec3f, v: vec3f) -> vec3f {
    var total = vec3f(0.0);
    var remaining = 1.0;
    let size = vec2f(textureDimensions(gi_irradiance_atlas));
    for (var c = 0u; c < gi.grid.w && remaining > 0.0; c++) {
        let wc = select(gi_cascade_weight(p, c), 1.0, c + 1u == gi.grid.w);
        if (wc <= 0.0) { continue; }
        var taps: array<GiTap, 8>;
        if (gi_taps(p, n, v, c, &taps) <= 0.0) { continue; }
        var e = vec3f(0.0);
        for (var k = 0u; k < 8u; k++) {
            if (taps[k].weight <= 0.0) { continue; }
            let uv = gi_atlas_uv(taps[k].index, n, GI_IRRADIANCE_TEXELS, size);
            e += textureSampleLevel(gi_irradiance_atlas, gi_sampler, uv, 0.0).rgb * taps[k].weight;
        }
        let w = remaining * wc;
        total += e * w;
        remaining -= w;
    }
    // O mapa guarda a média da radiância ponderada pelo cosseno (E/π).
    return total * GI_PI;
}

/** Radiância especular das sondas vinda da direção `dir` (refletida) no ponto `p`. */
fn gi_radiance(p: vec3f, n: vec3f, v: vec3f, dir: vec3f) -> vec3f {
    var total = vec3f(0.0);
    var remaining = 1.0;
    let size = vec2f(textureDimensions(gi_radiance_atlas));
    for (var c = 0u; c < gi.grid.w && remaining > 0.0; c++) {
        let wc = select(gi_cascade_weight(p, c), 1.0, c + 1u == gi.grid.w);
        if (wc <= 0.0) { continue; }
        var taps: array<GiTap, 8>;
        if (gi_taps(p, n, v, c, &taps) <= 0.0) { continue; }
        var l = vec3f(0.0);
        for (var k = 0u; k < 8u; k++) {
            if (taps[k].weight <= 0.0) { continue; }
            let uv = gi_atlas_uv(taps[k].index, dir, GI_IRRADIANCE_TEXELS, size);
            l += textureSampleLevel(gi_radiance_atlas, gi_sampler, uv, 0.0).rgb * taps[k].weight;
        }
        let w = remaining * wc;
        total += l * w;
        remaining -= w;
    }
    return total;
}
