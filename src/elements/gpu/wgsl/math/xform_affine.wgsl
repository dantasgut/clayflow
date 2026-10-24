// Transformação afim (spec 037, R3): parte linear 3×3 + translação (a última linha de `m` é (0, 0, 0, 1)). Referência
// f64: `elements/math/reference/xform.ts`. Tolerância: 1e-5 relativo com número de condição ≤ 1e3.
// Requer: linalg.

/** Abaixo deste |det| a parte linear é singular (ou o mundo ainda não foi calculado): a inversa é a identidade. */
const AFFINE_SINGULAR_DET: f32 = 1e-20;

fn affine_compose(a: mat4x4f, b: mat4x4f) -> mat4x4f {
    return a * b;
}

// A parte linear 3×3.
fn affine_linear(m: mat4x4f) -> mat3x3f {
    return mat3x3f(m[0].xyz, m[1].xyz, m[2].xyz);
}

// [M | t]⁻¹ = [M⁻¹ | −M⁻¹·t]; |det M| ≤ AFFINE_SINGULAR_DET dá a identidade.
fn affine_inverse(m: mat4x4f) -> mat4x4f {
    let l = affine_linear(m);
    if (abs(mat3_det(l)) <= AFFINE_SINGULAR_DET) {
        return mat4x4f(vec4f(1.0, 0.0, 0.0, 0.0), vec4f(0.0, 1.0, 0.0, 0.0), vec4f(0.0, 0.0, 1.0, 0.0), vec4f(0.0, 0.0, 0.0, 1.0));
    }
    let r = mat3_inverse(l);
    return mat4x4f(vec4f(r[0], 0.0), vec4f(r[1], 0.0), vec4f(r[2], 0.0), vec4f(-(r * m[3].xyz), 1.0));
}

fn affine_point(m: mat4x4f, p: vec3f) -> vec3f {
    return (m * vec4f(p, 1.0)).xyz;
}

fn affine_direction(m: mat4x4f, d: vec3f) -> vec3f {
    return (m * vec4f(d, 0.0)).xyz;
}

// A matriz das normais: (M⁻¹)ᵀ.
fn affine_normal(m: mat4x4f) -> mat3x3f {
    return mat3_transpose(mat3_inverse(affine_linear(m)));
}

// A matriz das normais a partir da inversa já calculada: a transposta da parte linear dela.
fn affine_normal_of_inverse(inverse: mat4x4f) -> mat3x3f {
    return transpose(affine_linear(inverse));
}
