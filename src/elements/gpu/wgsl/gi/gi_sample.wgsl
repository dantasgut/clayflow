// Luz indireta das sondas num ponto (spec 033, R7): a irradiância (difusa) na normal e a radiância especular na direção
// refletida, lidas dos atlas filtrados das sondas com os pesos de `gi_weights`, misturando as cascatas na borda.
// Requer: gi_common, gi_weights, gi, gi_irradiance_atlas, gi_radiance_atlas, gi_sampler.

// Em fluxo (cada sonda pesada e lida na hora, normalizada no fim): sem o vetor das 8, poucos registradores — estas
// leituras ficam no shader do desenho (o fallback fora das sondas de tela) e pesariam na ocupação de todo pixel.

/** Irradiância (E, W/m² na escala da cena) no ponto `p` com normal `n`, vista `v`. */
fn gi_irradiance(p: vec3f, n: vec3f, v: vec3f) -> vec3f {
    var total = vec3f(0.0);
    var remaining = 1.0;
    let size = vec2f(textureDimensions(gi_irradiance_atlas));
    for (var c = 0u; c < gi.grid.w && remaining > 0.0; c++) {
        let wc = select(gi_cascade_weight(p, c), 1.0, c + 1u == gi.grid.w);
        if (wc <= 0.0) { continue; }
        let cell = gi_cell_of(p, n, v, c);
        var e = vec3f(0.0);
        var sum = 0.0;
        for (var k = 0u; k < 8u; k++) {
            let t = gi_tap(cell, p, n, c, k);
            if (t.weight <= 0.0) { continue; }
            let uv = gi_atlas_uv(t.index, n, GI_IRRADIANCE_TEXELS, size);
            e += textureSampleLevel(gi_irradiance_atlas, gi_sampler, uv, 0.0).rgb * t.weight;
            sum += t.weight;
        }
        if (sum <= 0.0) { continue; }
        let w = remaining * wc;
        total += e / sum * w;
        remaining -= w;
    }
    // O mapa guarda a média da radiância ponderada pelo cosseno (E/π).
    return total * PI;
}

/** Radiância especular das sondas vinda da direção `dir` (refletida) no ponto `p`. */
fn gi_radiance(p: vec3f, n: vec3f, v: vec3f, dir: vec3f) -> vec3f {
    var total = vec3f(0.0);
    var remaining = 1.0;
    let size = vec2f(textureDimensions(gi_radiance_atlas));
    for (var c = 0u; c < gi.grid.w && remaining > 0.0; c++) {
        let wc = select(gi_cascade_weight(p, c), 1.0, c + 1u == gi.grid.w);
        if (wc <= 0.0) { continue; }
        let cell = gi_cell_of(p, n, v, c);
        var l = vec3f(0.0);
        var sum = 0.0;
        for (var k = 0u; k < 8u; k++) {
            let t = gi_tap(cell, p, n, c, k);
            if (t.weight <= 0.0) { continue; }
            let uv = gi_atlas_uv(t.index, dir, GI_IRRADIANCE_TEXELS, size);
            l += textureSampleLevel(gi_radiance_atlas, gi_sampler, uv, 0.0).rgb * t.weight;
            sum += t.weight;
        }
        if (sum <= 0.0) { continue; }
        let w = remaining * wc;
        total += l / sum * w;
        remaining -= w;
    }
    return total;
}
