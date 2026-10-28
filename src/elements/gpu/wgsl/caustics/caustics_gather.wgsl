// Leitura das cáusticas (spec 034, T067c; antes da GI, spec 033 US5) no hash dos fótons (`caustics_common.wgsl`): em cada
// nível, a irradiância e os fótons das 4 células em volta do ponto pela tenda 2D no plano tangente; vale o nível mais
// fino com `CAUSTICS_MIN_PHOTONS`, misturado com o de baixo pela fração que ele tem deles (sem emenda entre os níveis).
// Requer: caustics, caustics_common, caustics_hash (leitura).

/** Irradiância acumulada (rgb) e fótons por quadro (a) da célula `c` do nível `level` (0 sem ela). */
fn caustics_cell(c: vec3i, level: u32) -> vec4f {
    let key = caustics_key(c, level);
    if (key == CAUSTICS_EMPTY) { return vec4f(0.0); }
    let n = caustics_slots();
    var slot = caustics_bucket(c, level);
    for (var k = 0u; k < CAUSTICS_PROBES; k++) {
        let w = caustics_word(slot);
        let found = caustics_hash[w];
        if (found == key) {
            return vec4f(bitcast<f32>(caustics_hash[w + 4u]), bitcast<f32>(caustics_hash[w + 5u]),
                bitcast<f32>(caustics_hash[w + 6u]), bitcast<f32>(caustics_hash[w + 8u]));
        }
        if (found == CAUSTICS_EMPTY) { return vec4f(0.0); }
        slot = (slot + 1u) % n;
    }
    return vec4f(0.0);
}

/** A irradiância e os fótons acumulados do nível `level` no ponto `p` de normal `n` (a tenda 2D). */
fn caustics_level(p: vec3f, n: vec3f, level: u32) -> vec4f {
    let t = caustics_tent(p, n, level);
    var e = vec4f(0.0);
    for (var k = 0u; k < 4u; k++) {
        e += caustics_cell(caustics_tent_cell(t, k), level) * caustics_tent_weight(t, k);
    }
    // Os do quadro na média móvel vezes os quadros efetivos dela.
    return vec4f(e.rgb, e.a * (1.0 + CAUSTICS_HYSTERESIS) / (1.0 - CAUSTICS_HYSTERESIS));
}

/** Irradiância das cáusticas no ponto `p` de normal `n` (0 sem fótons). */
fn caustics_irradiance(p: vec3f, n: vec3f) -> vec3f {
    if (caustics_hash[1] == 0u) { return vec3f(0.0); }
    var finer = caustics_level(p, n, 0u);
    if (finer.a >= CAUSTICS_MIN_PHOTONS) { return finer.rgb; }
    for (var level = 1u; level < CAUSTICS_LEVELS; level++) {
        let here = caustics_level(p, n, level);
        if (here.a >= CAUSTICS_MIN_PHOTONS || level + 1u == CAUSTICS_LEVELS) {
            return mix(here.rgb, finer.rgb, clamp(finer.a / CAUSTICS_MIN_PHOTONS, 0.0, 1.0));
        }
        finer = here;
    }
    return finer.rgb;
}
