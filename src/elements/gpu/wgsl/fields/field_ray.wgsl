// Os raios no campo dos fluidos (spec 033, R11; spec 034): a entrada na água de uma origem fora dela e a saída de uma
// origem dentro, pela marcha no campo, com a normal tricúbica e o material. As contribuições aos pontos de volume
// (`ray_volume_hit`, `ray_volume_enter`, `ray_volume_exit`) chamam estas.
// Requer: ray_volume_types, fields, NONE.

/** Pontos checados num trecho de dentro da água para localizar a saída. */
const FIELD_EXIT_PROBES: u32 = 4u;
/** Passos da secante no ponto da saída. */
const FIELD_EXIT_SECANT: u32 = 2u;

/** Entrada mais próxima até `t_max` (a origem fora da água). */
fn field_ray_enter(origin: vec3f, dir: vec3f, t_max: f32) -> RayVolumeHit {
    let none = RayVolumeHit(t_max, origin + dir * t_max, -dir, 0u, false, false);
    let span = field_clip(origin, dir, 0.0, t_max);
    if (span.x >= span.y) { return none; }
    let h = field_march(origin, dir, span.x, span.y, false, true);
    if (!h.hit) { return none; }
    return RayVolumeHit(h.t, h.p, h.n, h.material, true, false);
}

/**
 * Saída mais próxima até `t_max` (a origem dentro da água). Pontos espaçados no trecho (até a superfície já conhecida, o
 * fundo, ou o fim do campo) localizam a saída entre o último ainda dentro e o primeiro fora, e a secante na trilinear
 * acha o ponto. Sem ponto fora antes de uma superfície conhecida, não há saída antes dela (os pontos param antes dela: a
 * água de partículas fica a um raio, e a fresta não é uma saída). A normal da saída é a direção do raio: medido na
 * barragem de 36 864 partículas (spec 034), a marcha e a normal da saída custavam ~4 ms a 1280 × 720 — a saída vista de
 * dentro não desvia o raio (aproximação registrada); a absorção para nela e o raio segue até o que está atrás.
 */
fn field_ray_exit(origin: vec3f, dir: vec3f, t_max: f32) -> RayVolumeHit {
    let none = RayVolumeHit(t_max, origin + dir * t_max, -dir, 0u, false, true);
    let span = field_clip(origin, dir, 0.0, t_max);
    if (span.x >= span.y) { return none; }
    var cache = vec4i(2147483647, 0, 0, bitcast<i32>(NONE));
    let known = t_max < 1e3;
    let reach = min(t_max, span.y);
    let probes = select(FIELD_EXIT_PROBES + 1u, FIELD_EXIT_PROBES, known);
    var a = 0.0;
    var fa = -1.0;
    var c = -1.0;
    var fc = 0.0;
    for (var k = 1u; k <= probes && c < 0.0; k++) {
        let t = reach * f32(k) / f32(FIELD_EXIT_PROBES + 1u);
        let f = field_phi_cached(origin + dir * t, &cache);
        if (f < 0.0) { a = t; fa = f; } else { c = t; fc = f; }
    }
    if (c < 0.0) {
        if (known) { return none; }
        // Até o fim do campo: lá já é fora.
        c = span.y;
        fc = 1.0;
    }
    // Secante entre o último ponto dentro (φ < 0) e o primeiro fora (φ ≥ 0).
    for (var k = 0u; k < FIELD_EXIT_SECANT; k++) {
        if (fc - fa <= 0.0) { break; }
        let m = a + (c - a) * (-fa / (fc - fa));
        let fm = field_phi_cached(origin + dir * m, &cache);
        if (fm < 0.0) { a = m; fa = fm; } else { c = m; fc = fm; }
    }
    let t = select(a + (c - a) * (-fa / (fc - fa)), c, fc - fa <= 0.0);
    return RayVolumeHit(t, origin + dir * t, dir, field_material_at(origin), true, true);
}
