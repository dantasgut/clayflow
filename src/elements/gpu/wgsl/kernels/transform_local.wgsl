// Matriz local de um Transform (convenção M = T · R · S) e a sua matriz de normais, compartilhada pela composição das
// raízes e pela dos níveis da hierarquia.
// Requer: structs Transform, WorldTransform; quat, mat.

// Recíproco seguro: escala 0 colapsa o eixo e anula a contribuição na normal.
fn safe_inverse(v: f32) -> f32 {
    return select(0.0, 1.0 / v, abs(v) > 1e-12);
}

fn transform_local(t: Transform) -> WorldTransform {
    // Quaternion de módulo ~0 vira identidade; o resto é normalizado.
    let q = select(vec4f(0.0, 0.0, 0.0, 1.0), quat_normalize(t.rotation), length(t.rotation) > 1e-7);
    let r = mat3_from_quat(q);
    let s = t.scale.xyz;
    var out: WorldTransform;
    out.world = mat4x4f(
        vec4f(r[0] * s.x, 0.0),
        vec4f(r[1] * s.y, 0.0),
        vec4f(r[2] * s.z, 0.0),
        vec4f(t.position.xyz, 1.0),
    );
    out.normal = mat3x3f(
        r[0] * safe_inverse(s.x),
        r[1] * safe_inverse(s.y),
        r[2] * safe_inverse(s.z),
    );
    return out;
}
