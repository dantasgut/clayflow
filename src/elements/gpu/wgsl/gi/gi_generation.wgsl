// Irradiância de um rebatimento anterior no ponto atingido (spec 033, R2): as sondas das cascatas em volta, com os pesos
// de `gi_weights`, lendo o texel mais próximo do mapa octaédrico do rebatimento `k` nos buffers das sondas (o atlas
// filtrado guarda só o último rebatimento, o do desenho).
// Requer: gi_common, gi_weights, gi, gi_generations_read.

fn gi_unpack_generation(p: vec2u) -> vec3f {
    return vec3f(unpack2x16float(p.x), unpack2x16float(p.y).x);
}

/**
 * Os pesos das sondas para um ponto (normal `n`, vista `v`), já com a mistura das cascatas (até duas: a mais fina que o
 * contém e a seguinte na borda dela), e o texel do mapa octaédrico na normal — calculados uma vez e lidos para cada
 * rebatimento (`gi_generation_at`): o estado das sondas e a visibilidade de Chebyshev não se repetem por geração.
 */
struct GiGenerationWeights {
    taps: array<GiTap, 16>,
    texel: u32,
}

fn gi_generation_weights(p: vec3f, n: vec3f, v: vec3f) -> GiGenerationWeights {
    var out: GiGenerationWeights;
    let o = gi_oct_encode(n) * 0.5 + 0.5;
    let t = min(vec2u(o * f32(GI_IRRADIANCE_TEXELS)), vec2u(GI_IRRADIANCE_TEXELS - 1u));
    out.texel = t.x + t.y * GI_IRRADIANCE_TEXELS;
    var remaining = 1.0;
    var used = 0u;
    for (var c = 0u; c < gi.grid.w && remaining > 0.0 && used < 2u; c++) {
        let wc = select(gi_cascade_weight(p, c), 1.0, c + 1u == gi.grid.w);
        if (wc <= 0.0) { continue; }
        var taps: array<GiTap, 8>;
        if (gi_taps(p, n, v, c, &taps) <= 0.0) { continue; }
        let w = select(remaining * wc, remaining, used == 1u);
        for (var j = 0u; j < 8u; j++) { out.taps[used * 8u + j] = GiTap(taps[j].index, taps[j].weight * w); }
        remaining -= w;
        used++;
    }
    return out;
}

/** Irradiância (E) do rebatimento `k` pelos pesos dados. */
fn gi_generation_at(w: GiGenerationWeights, k: u32) -> vec3f {
    let texels = GI_IRRADIANCE_TEXELS * GI_IRRADIANCE_TEXELS;
    let probes = gi_probe_count();
    var e = vec3f(0.0);
    for (var j = 0u; j < 16u; j++) {
        if (w.taps[j].weight <= 0.0) { continue; }
        e += gi_unpack_generation(gi_generations[(k * probes + w.taps[j].index) * texels + w.texel]) * w.taps[j].weight;
    }
    return e * GI_PI;
}

/** Irradiância (E) do rebatimento `k` no ponto `p` com normal `n`, vista `v`. */
fn gi_generation_irradiance(k: u32, p: vec3f, n: vec3f, v: vec3f) -> vec3f {
    return gi_generation_at(gi_generation_weights(p, n, v), k);
}
