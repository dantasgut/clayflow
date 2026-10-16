// Nós de conversão de espaço (spec 031, R12): uma matriz 4×4 (entrada do grafo: a de mundo da entidade, a vista ou a
// projeção da câmera, a inversa) aplicada a um ponto (w = 1), a uma direção (w = 0) ou a uma normal (inversa transposta
// da parte 3×3, normalizada); a inversa de uma matriz afim; a projeção com divisão perspectiva (clip → NDC). Objeto →
// mundo: a matriz de mundo; mundo → objeto: a inversa dela; mundo → vista: a vista.
// Requer: linalg.

fn node_space_point(m: mat4x4f, p: vec3f) -> vec3f {
    return (m * vec4f(p, 1.0)).xyz;
}

fn node_space_direction(m: mat4x4f, d: vec3f) -> vec3f {
    return (m * vec4f(d, 0.0)).xyz;
}

fn node_space_normal(m: mat4x4f, n: vec3f) -> vec3f {
    let r = mat3x3f(m[0].xyz, m[1].xyz, m[2].xyz);
    return normalize(mat3_transpose(mat3_inverse(r)) * n);
}

// Inversa afim: [R | t]⁻¹ = [R⁻¹ | −R⁻¹·t] (a última linha de `m` deve ser (0, 0, 0, 1)).
fn node_space_inverse(m: mat4x4f) -> mat4x4f {
    let r = mat3_inverse(mat3x3f(m[0].xyz, m[1].xyz, m[2].xyz));
    return mat4x4f(
        vec4f(r[0], 0.0),
        vec4f(r[1], 0.0),
        vec4f(r[2], 0.0),
        vec4f(-(r * m[3].xyz), 1.0),
    );
}

fn node_space_project(m: mat4x4f, p: vec3f) -> vec3f {
    let clip = m * vec4f(p, 1.0);
    return clip.xyz / clip.w;
}
