// Composição pela função do usuário (spec 009): para cada par (slot do Transform, slot do registro de parâmetros) do
// grupo, a matriz de mundo local vem de `transform_fn` e a de normais é a inversa transposta do bloco 3×3 (bloco
// singular: as normais ficam como as do TRS). Matriz com valor não finito mantém a do TRS, já composta neste quadro.
// Roda depois da composição de todos os slots e antes dos níveis da hierarquia (um filho com função compõe sobre o
// pai a partir desta matriz local).
// Requer: structs Transform, WorldTransform, TransformFnRecord, TransformFnGroup; transform_fn (ponto); linalg.

@group(0) @binding(0) var<storage, read>       transforms:           array<Transform>;
@group(0) @binding(1) var<storage, read_write> worlds:               array<WorldTransform>;
@group(0) @binding(2) var<storage, read>       transform_fn_records: array<TransformFnRecord>;
@group(0) @binding(3) var<storage, read>       transform_fn_pairs:   array<vec2u>;
@group(1) @binding(0) var<uniform>             transform_fn_group:   TransformFnGroup;

fn transform_fn_finite(m: mat4x4f) -> bool {
    for (var c = 0u; c < 4u; c++) {
        let v = m[c];
        // NaN não é igual a si mesmo; infinito passa do maior f32 finito.
        if (any(v != v) || any(abs(v) > vec4f(3.4e38))) { return false; }
    }
    return true;
}

@compute @workgroup_size(64)
fn transform_compose_fn_main(
    @builtin(global_invocation_id) gid3: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
) {
    let k = gid3.x + gid3.y * nwg.x * 64u;
    if (k >= transform_fn_group.count) { return; }
    let pair = transform_fn_pairs[transform_fn_group.first + k];
    let data = transform_fn_params(transform_fn_records[pair.y]);
    let m = transform_fn(pair.x, transforms[pair.x], data, transform_fn_group.time);
    if (!transform_fn_finite(m)) { return; }
    worlds[pair.x].world = m;
    let b = mat3x3f(m[0].xyz, m[1].xyz, m[2].xyz);
    let det = mat3_det(b);
    if (abs(det) > 1e-20) {
        worlds[pair.x].normal = mat3_transpose(mat3_inverse(b));
    }
}
