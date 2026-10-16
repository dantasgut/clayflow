// Nó de rampa de cor (spec 031): de `color_a` em `low` a `color_b` em `high`, linear, presa nos extremos.
// Requer: nada.

fn node_color_ramp(t: f32, color_a: vec3f, color_b: vec3f, low: f32, high: f32) -> vec3f {
    let span = select(high - low, 1e-6, abs(high - low) < 1e-6);
    return mix(color_a, color_b, clamp((t - low) / span, 0.0, 1.0));
}
