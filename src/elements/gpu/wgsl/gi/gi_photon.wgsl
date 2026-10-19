// Leitura das cáusticas (spec 033, US5; spec 034, R6) no hash dos fótons (`gi_photon_common.wgsl`): a irradiância das
// células em volta do ponto no plano da superfície (bilinear: sem os blocos das células).
// Requer: gi, gi_photon_common, gi_caustics (leitura).

/** Irradiância acumulada da célula `c` (0 sem ela). */
fn gi_photon_cell(c: vec3i) -> vec3f {
    let key = gi_photon_key(c);
    if (key == GI_PHOTON_EMPTY) { return vec3f(0.0); }
    let n = gi_photon_slots();
    var slot = gi_photon_bucket(c);
    for (var k = 0u; k < GI_PHOTON_PROBES; k++) {
        let w = gi_photon_word(slot);
        let found = gi_caustics[w];
        if (found == key) {
            return vec3f(bitcast<f32>(gi_caustics[w + 4u]), bitcast<f32>(gi_caustics[w + 5u]),
                bitcast<f32>(gi_caustics[w + 6u]));
        }
        if (found == GI_PHOTON_EMPTY) { return vec3f(0.0); }
        slot = (slot + 1u) % n;
    }
    return vec3f(0.0);
}

/**
 * Irradiância das cáusticas no ponto `p` da superfície de normal `n` (0 desligadas ou sem fótons): bilinear nas 4
 * células em volta dele no plano da superfície, na camada do plano no centro de cada uma (spec 034, R6). A até ¼ de
 * célula da fronteira de duas camadas lê também a vizinha: o fóton e o desenho podem cair de lados diferentes de um plano na
 * fronteira (o chão em y = 0), e cada fóton deposita numa camada só.
 */
fn gi_caustic_irradiance(p: vec3f, n: vec3f) -> vec3f {
    if (gi.bounces.w == 0u || gi_caustics[1] == 0u) { return vec3f(0.0); }
    let f = gi_photon_frame(p, n);
    let base = vec2i(floor(f.plane));
    let t = f.plane - vec2f(base);
    var e = vec3f(0.0);
    for (var k = 0u; k < 4u; k++) {
        let o = vec2i(i32(k & 1u), i32(k >> 1u));
        let w = mix(vec2f(1.0) - t, t, vec2f(o));
        let height = gi_photon_frame_height(f, base + o);
        let layer = i32(floor(height));
        let depth = height - f32(layer);
        var cell = gi_photon_cell(gi_photon_frame_cell(f, base + o, layer));
        if (depth < 0.25) { cell += gi_photon_cell(gi_photon_frame_cell(f, base + o, layer - 1)); }
        if (depth > 0.75) { cell += gi_photon_cell(gi_photon_frame_cell(f, base + o, layer + 1)); }
        e += cell * (w.x * w.y);
    }
    return e;
}
