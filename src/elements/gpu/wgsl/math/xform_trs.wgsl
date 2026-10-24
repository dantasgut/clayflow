// TRS (spec 037, R3): posição, quaternion e escala na convenção M = T · R · S, e a matriz das normais R · S⁻¹ (a conta
// barata do TransformFlow). Referência f64: `elements/math/reference/xform.ts`. Tolerância: 4 ulp por componente.
// Requer: quat, mat.

// Recíproco seguro: escala 0 colapsa o eixo e anula a contribuição na normal.
fn safe_inverse(v: f32) -> f32 {
    return select(0.0, 1.0 / v, abs(v) > 1e-12);
}

// A rotação de um quaternion: módulo ~0 vira identidade; o resto é normalizado.
fn trs_rotation(rotation: vec4f) -> mat3x3f {
    let q = select(vec4f(0.0, 0.0, 0.0, 1.0), quat_normalize(rotation), length(rotation) > 1e-7);
    return mat3_from_quat(q);
}

fn trs_world(position: vec3f, rotation: vec4f, scale: vec3f) -> mat4x4f {
    let r = trs_rotation(rotation);
    return mat4x4f(
        vec4f(r[0] * scale.x, 0.0),
        vec4f(r[1] * scale.y, 0.0),
        vec4f(r[2] * scale.z, 0.0),
        vec4f(position, 1.0),
    );
}

fn trs_normal(rotation: vec4f, scale: vec3f) -> mat3x3f {
    let r = trs_rotation(rotation);
    return mat3x3f(r[0] * safe_inverse(scale.x), r[1] * safe_inverse(scale.y), r[2] * safe_inverse(scale.z));
}
