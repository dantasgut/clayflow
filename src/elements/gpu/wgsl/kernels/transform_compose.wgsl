// Estágio de transformação: compõe a matriz de mundo e a matriz de normais de cada slot
// a partir da intenção (posição, rotação, escala). Convenção M = T · R · S.
// Requer: structs/transform, structs/world_transform, math/quat, math/mat.

@group(0) @binding(0) var<storage, read>       transforms: array<Transform>;
@group(0) @binding(1) var<storage, read_write> worlds:     array<WorldTransform>;
@group(0) @binding(2) var<uniform>             params:     TransformParams;

// Recíproco seguro: escala 0 colapsa o eixo e anula a contribuição na normal.
fn safe_inverse(v: f32) -> f32 {
    return select(0.0, 1.0 / v, abs(v) > 1e-12);
}

@compute @workgroup_size(64)
fn transform_compose_main(
    @builtin(global_invocation_id) gid3: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
) {
    // Índice linear: despacho distribuído em x/y dentro do limite por dimensão (Dispatcher.invocations).
    let gid = vec3u(gid3.x + gid3.y * nwg.x * 64u, 0u, 0u);
    let i = gid.x;
    if (i >= params.count) { return; }

    let t = transforms[i];
    // Quaternion de módulo ~0 vira identidade; o resto é normalizado.
    let q = select(vec4f(0.0, 0.0, 0.0, 1.0), quat_normalize(t.rotation), length(t.rotation) > 1e-7);
    let r = mat3_from_quat(q);
    let s = t.scale.xyz;

    worlds[i].world = mat4x4f(
        vec4f(r[0] * s.x, 0.0),
        vec4f(r[1] * s.y, 0.0),
        vec4f(r[2] * s.z, 0.0),
        vec4f(t.position.xyz, 1.0),
    );
    worlds[i].normal = mat3x3f(
        r[0] * safe_inverse(s.x),
        r[1] * safe_inverse(s.y),
        r[2] * safe_inverse(s.z),
    );
}
