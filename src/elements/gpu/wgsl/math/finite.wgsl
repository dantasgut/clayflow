// Saneamento de não finitos (spec 031, FR-011): um único lugar para o teste usado nas saídas das funções de ponto e
// dos grafos. Finito = não NaN (v == v) e |v| abaixo do maior f32 representável (≈ 3,4·10³⁸).

fn finite3(v: vec3f) -> bool {
    return all(v == v) && all(abs(v) < vec3f(3.4e38));
}

fn finite4(v: vec4f) -> bool {
    return all(v == v) && all(abs(v) < vec4f(3.4e38));
}

// Matriz 4×4 finita: nenhuma coluna com NaN nem |v| acima do maior f32 finito.
fn finite_mat4(m: mat4x4f) -> bool {
    for (var c = 0u; c < 4u; c++) {
        let v = m[c];
        if (any(v != v) || any(abs(v) > vec4f(3.4e38))) { return false; }
    }
    return true;
}
