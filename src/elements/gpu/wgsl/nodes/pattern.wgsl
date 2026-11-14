// Nós de padrão procedural (spec 038): o xadrez em 2D e em 3D sobre `q = p·scale + offset`, avaliado por pixel. O valor
// (0 nas casas pares, 1 nas ímpares) é a média da onda quadrada sobre a largura do pixel em células (`width·scale`, o
// filtro de caixa analítico: a integral da onda quadrada é uma onda triangular) — ao longe, onde a casa fica menor que o
// pixel, o padrão vai à média (0,5) em vez de cintilar. `width` 0: o xadrez exato.
// Requer: nada.

/** A onda quadrada (±1, período 2) média sobre [q − w/2, q + w/2], por eixo; exata com `w` abaixo de 1e-4. */
fn node_pattern_square(q: vec3f, w: vec3f) -> vec3f {
    let exact = select(vec3f(-1.0), vec3f(1.0), fract(q * 0.5) < vec3f(0.5));
    let safe = max(w, vec3f(1e-4));
    let filtered = 2.0 * (abs(fract((q - 0.5 * safe) * 0.5) - 0.5) - abs(fract((q + 0.5 * safe) * 0.5) - 0.5)) / safe;
    return select(filtered, exact, w < vec3f(1e-4));
}

fn node_pattern_checker2(p: vec2f, width: f32, scale: f32, offset: vec2f) -> f32 {
    let s = node_pattern_square(vec3f(p * scale + offset, 0.5), vec3f(vec2f(max(width, 0.0) * abs(scale)), 0.0));
    return 0.5 - 0.5 * s.x * s.y;
}

fn node_pattern_checker3(p: vec3f, width: f32, scale: f32, offset: vec3f) -> f32 {
    let s = node_pattern_square(p * scale + offset, vec3f(max(width, 0.0) * abs(scale)));
    return 0.5 - 0.5 * s.x * s.y * s.z;
}
