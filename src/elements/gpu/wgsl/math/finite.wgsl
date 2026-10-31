// Saneamento de não finitos (spec 031, FR-011): um único lugar para o teste usado nas saídas das funções de ponto e
// dos grafos. Finito = o expoente do f32 não é o todo-um (que é o do infinito e o do NaN), lido nos bits: o WGSL não
// garante infinito nem NaN, e o compilador com matemática rápida (o Metal pelo wgpu) apaga o teste `v == v`, que supõe
// sempre verdadeiro.

/** O expoente todo-um do f32 (infinito ou NaN). */
const FINITE_EXPONENT: u32 = 0x7f800000u;

fn finite3(v: vec3f) -> bool {
    return all((bitcast<vec3u>(v) & vec3u(FINITE_EXPONENT)) != vec3u(FINITE_EXPONENT));
}

fn finite4(v: vec4f) -> bool {
    return all((bitcast<vec4u>(v) & vec4u(FINITE_EXPONENT)) != vec4u(FINITE_EXPONENT));
}

// Matriz 4×4 finita: nenhuma coluna com infinito nem NaN.
fn finite_mat4(m: mat4x4f) -> bool {
    for (var c = 0u; c < 4u; c++) {
        if (!finite4(m[c])) { return false; }
    }
    return true;
}
