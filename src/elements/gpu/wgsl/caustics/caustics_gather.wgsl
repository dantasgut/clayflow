// Leitura das cáusticas (spec 034, T067c; antes da GI, spec 033 US5) no hash dos fótons (`caustics_common.wgsl`): a
// soma dos níveis, cada um pela B-spline quadrática no plano tangente nas 3 × 3 células em volta do ponto
// (`caustics_spline`; o depósito é pela tenda e foi ao nível do tamanho da pegada dele).
// Requer: caustics, caustics_common, caustics_hash (leitura).

/** Irradiância acumulada (rgb) da célula `c` do nível `level` (0 sem ela). */
fn caustics_cell(c: vec3i, level: u32) -> vec3f {
    let key = caustics_key(c);
    if (key == CAUSTICS_EMPTY) { return vec3f(0.0); }
    var slot = caustics_bucket(c, level);
    for (var k = 0u; k < CAUSTICS_PROBES; k++) {
        let w = caustics_word(slot);
        let found = caustics_hash[w];
        if (found == key) {
            return vec3f(bitcast<f32>(caustics_hash[w + 4u]), bitcast<f32>(caustics_hash[w + 5u]),
                bitcast<f32>(caustics_hash[w + 6u]));
        }
        if (found == CAUSTICS_EMPTY) { return vec3f(0.0); }
        slot = caustics_probe_next(slot, level);
    }
    return vec3f(0.0);
}

/** Irradiância das cáusticas no ponto `p` de normal `n` (0 sem fótons). */
fn caustics_irradiance(p: vec3f, n: vec3f) -> vec3f {
    if (caustics_hash[1] == 0u) { return vec3f(0.0); }
    let anchor = bitcast<vec3f>(vec3u(caustics_hash[CAUSTICS_ANCHOR], caustics_hash[CAUSTICS_ANCHOR + 1u],
        caustics_hash[CAUSTICS_ANCHOR + 2u]));
    let q = p - anchor;
    var e = vec3f(0.0);
    for (var level = 0u; level < CAUSTICS_LEVELS; level++) {
        let s = caustics_spline(q, n, level);
        for (var k = 0u; k < 9u; k++) {
            e += caustics_cell(caustics_spline_cell(s, k), level) * caustics_spline_weight(s, k);
        }
    }
    return e;
}
