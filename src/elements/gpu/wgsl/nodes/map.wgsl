// Nós de mapeamento (spec 031, R12): faixa (`[in_min, in_max]` → `[out_min, out_max]`, presa ou não) e curva por quatro
// pontos (`pK = (x, y)`, x crescente; linear por trecho, constante fora dos extremos).
// Requer: nada.

fn node_map_range(
    x: f32,
    in_min: f32,
    in_max: f32,
    out_min: f32,
    out_max: f32,
    clamped: u32,
) -> f32 {
    let span = select(in_max - in_min, 1e-6, abs(in_max - in_min) < 1e-6);
    let t = (x - in_min) / span;
    return mix(out_min, out_max, select(t, clamp(t, 0.0, 1.0), clamped != 0u));
}

// Um trecho da curva: de `a` a `b`, linear em x.
fn node_map_segment(x: f32, a: vec2f, b: vec2f) -> f32 {
    let span = select(b.x - a.x, 1e-6, abs(b.x - a.x) < 1e-6);
    return mix(a.y, b.y, clamp((x - a.x) / span, 0.0, 1.0));
}

fn node_map_curve4(x: f32, p0: vec2f, p1: vec2f, p2: vec2f, p3: vec2f) -> f32 {
    if (x <= p0.x) { return p0.y; }
    if (x <= p1.x) { return node_map_segment(x, p0, p1); }
    if (x <= p2.x) { return node_map_segment(x, p1, p2); }
    if (x <= p3.x) { return node_map_segment(x, p2, p3); }
    return p3.y;
}
