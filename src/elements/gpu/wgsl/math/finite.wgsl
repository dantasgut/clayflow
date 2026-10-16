// Saneamento de não finitos (spec 031, FR-011): um único lugar para o teste usado nas saídas das funções de ponto e
// dos grafos. Finito = não NaN (v == v) e |v| abaixo do maior f32 representável (≈ 3,4·10³⁸).

fn finite3(v: vec3f) -> bool {
    return all(v == v) && all(abs(v) < vec3f(3.4e38));
}

fn finite4(v: vec4f) -> bool {
    return all(v == v) && all(abs(v) < vec4f(3.4e38));
}
