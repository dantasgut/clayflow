// Triângulo de tela cheia dos passes da refração (spec 034): a composição do traçado e o movimento do que ele mostra.
// Requer: nada.

@vertex
fn refraction_screen_vs(@builtin(vertex_index) vi: u32) -> @builtin(position) vec4f {
    let x = f32((vi << 1u) & 2u);
    let y = f32(vi & 2u);
    return vec4f(x * 2.0 - 1.0, 1.0 - y * 2.0, 0.0, 1.0);
}
