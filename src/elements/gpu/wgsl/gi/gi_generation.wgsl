// Irradiância de um rebatimento anterior no ponto atingido (spec 033, R2): as sondas das cascatas em volta, com os pesos
// de `gi_weights`, lendo o mapa octaédrico do rebatimento `k` nos buffers das sondas pela bilinear dos 4 texels em volta
// da normal (spec 034, L8; na borda, o texel vizinho pela dobra do octaedro) — o atlas filtrado guarda só o último
// rebatimento, o do desenho.
// Requer: gi_common, gi_weights, gi, gi_generations_read.

/**
 * Os pesos das sondas para um ponto (normal `n`, vista `v`), já com a mistura das cascatas (até duas: a mais fina que o
 * contém e a seguinte na borda dela), e o texel do mapa octaédrico na normal — calculados uma vez e lidos para cada
 * rebatimento (`gi_generation_at`): o estado das sondas e a visibilidade de Chebyshev não se repetem por geração.
 */
struct GiGenerationWeights {
    taps: array<GiTap, 16>,
    texels: vec4u,
    bilinear: vec4f,
}

/** O texel `t` do mapa octaédrico (cada eixo em −1…N): fora da borda, o espelhado pela dobra do octaedro (DDGI). */
fn gi_oct_texel(t: vec2i) -> u32 {
    let last = i32(GI_IRRADIANCE_TEXELS) - 1;
    var q = t;
    if (q.x < 0 || q.x > last) { q = vec2i(clamp(q.x, 0, last), last - q.y); }
    if (q.y < 0 || q.y > last) { q = vec2i(last - q.x, clamp(q.y, 0, last)); }
    return u32(q.x) + u32(q.y) * GI_IRRADIANCE_TEXELS;
}

fn gi_generation_weights(p: vec3f, n: vec3f, v: vec3f) -> GiGenerationWeights {
    var out: GiGenerationWeights;
    let g = (gi_oct_encode(n) * 0.5 + 0.5) * f32(GI_IRRADIANCE_TEXELS) - 0.5;
    let base = vec2i(floor(g));
    let f = g - vec2f(base);
    for (var k = 0u; k < 4u; k++) {
        let d = vec2i(i32(k & 1u), i32(k >> 1u));
        out.texels[k] = gi_oct_texel(base + d);
        let b = mix(vec2f(1.0) - f, f, vec2f(d));
        out.bilinear[k] = b.x * b.y;
    }
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
        let at = (k * probes + w.taps[j].index) * texels;
        var texel = vec3f(0.0);
        for (var q = 0u; q < 4u; q++) { texel += unpack_half_rgb(gi_generations[at + w.texels[q]]) * w.bilinear[q]; }
        e += texel * w.taps[j].weight;
    }
    return e * PI;
}

/** Irradiância (E) do rebatimento `k` no ponto `p` com normal `n`, vista `v`. */
fn gi_generation_irradiance(k: u32, p: vec3f, n: vec3f, v: vec3f) -> vec3f {
    return gi_generation_at(gi_generation_weights(p, n, v), k);
}
