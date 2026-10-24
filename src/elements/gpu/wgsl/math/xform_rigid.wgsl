// Transformação rígida (spec 037, R3): rotação + translação, sem escala. A classe é escolhida pelo nome na montagem do
// kernel (nunca por ramo em execução); a lista de operações é a mesma das outras classes (`affine_`, `projective_`).
// Referência f64: `elements/math/reference/xform.ts`. Tolerância contra ela: 4 ulp por componente.

fn rigid_compose(a: mat4x4f, b: mat4x4f) -> mat4x4f {
    return a * b;
}

// [R | t]⁻¹ = [Rᵀ | −Rᵀ·t]: a componente i de −Rᵀ·t é −(coluna i de R) · t.
fn rigid_inverse(m: mat4x4f) -> mat4x4f {
    let t = m[3].xyz;
    return mat4x4f(
        vec4f(m[0].x, m[1].x, m[2].x, 0.0),
        vec4f(m[0].y, m[1].y, m[2].y, 0.0),
        vec4f(m[0].z, m[1].z, m[2].z, 0.0),
        vec4f(-dot(m[0].xyz, t), -dot(m[1].xyz, t), -dot(m[2].xyz, t), 1.0),
    );
}

// A rotação inversa (Rᵀ) — a das normais e das direções de volta.
fn rigid_rotation_inverse(m: mat4x4f) -> mat3x3f {
    return transpose(mat3x3f(m[0].xyz, m[1].xyz, m[2].xyz));
}

fn rigid_point(m: mat4x4f, p: vec3f) -> vec3f {
    return (m * vec4f(p, 1.0)).xyz;
}

fn rigid_direction(m: mat4x4f, d: vec3f) -> vec3f {
    return (m * vec4f(d, 0.0)).xyz;
}
