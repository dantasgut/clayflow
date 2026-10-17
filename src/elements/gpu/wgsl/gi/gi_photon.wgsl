// Leitura das cáusticas (spec 033, US5) no hash dos fótons (`gi_photon_common.wgsl`): a irradiância das 8 células em
// volta do ponto (trilinear: sem os blocos das células).
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

/** Irradiância das cáusticas no ponto `p` (trilinear nas células; 0 desligadas ou sem fótons). */
fn gi_caustic_irradiance(p: vec3f) -> vec3f {
    if (gi.bounces.w == 0u || gi_caustics[1] == 0u) { return vec3f(0.0); }
    let g = p / gi.extra.y - 0.5;
    let base = vec3i(floor(g));
    let f = g - vec3f(base);
    var e = vec3f(0.0);
    for (var k = 0u; k < 8u; k++) {
        let o = vec3i(i32(k & 1u), i32((k >> 1u) & 1u), i32(k >> 2u));
        let w = mix(vec3f(1.0) - f, f, vec3f(o));
        e += gi_photon_cell(base + o) * (w.x * w.y * w.z);
    }
    return e;
}
