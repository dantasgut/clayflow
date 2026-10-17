// Irradiância de um rebatimento anterior no ponto atingido (spec 033, R2): as sondas das cascatas em volta, com os pesos
// de `gi_weights`, lendo o texel mais próximo do mapa octaédrico do rebatimento `k` nos buffers das sondas (o atlas
// filtrado guarda só o último rebatimento, o do desenho).
// Requer: gi_common, gi_weights, gi, gi_generations_read.

fn gi_unpack_generation(p: vec2u) -> vec3f {
    return vec3f(unpack2x16float(p.x), unpack2x16float(p.y).x);
}

/** Irradiância (E) do rebatimento `k` no ponto `p` com normal `n`, vista `v`. */
fn gi_generation_irradiance(k: u32, p: vec3f, n: vec3f, v: vec3f) -> vec3f {
    let texels = GI_IRRADIANCE_TEXELS * GI_IRRADIANCE_TEXELS;
    let o = gi_oct_encode(n) * 0.5 + 0.5;
    let t = min(vec2u(o * f32(GI_IRRADIANCE_TEXELS)), vec2u(GI_IRRADIANCE_TEXELS - 1u));
    let texel = t.x + t.y * GI_IRRADIANCE_TEXELS;
    let probes = gi_probe_count();
    var total = vec3f(0.0);
    var remaining = 1.0;
    for (var c = 0u; c < gi.grid.w && remaining > 0.0; c++) {
        let wc = select(gi_cascade_weight(p, c), 1.0, c + 1u == gi.grid.w);
        if (wc <= 0.0) { continue; }
        var taps: array<GiTap, 8>;
        if (gi_taps(p, n, v, c, &taps) <= 0.0) { continue; }
        var e = vec3f(0.0);
        for (var j = 0u; j < 8u; j++) {
            if (taps[j].weight <= 0.0) { continue; }
            e += gi_unpack_generation(gi_generations[(k * probes + taps[j].index) * texels + texel]) * taps[j].weight;
        }
        let w = remaining * wc;
        total += e * w;
        remaining -= w;
    }
    return total * GI_PI;
}
