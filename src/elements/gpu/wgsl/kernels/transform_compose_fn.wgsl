// Composição pela função do usuário (spec 009): para cada par (slot do Transform, slot do registro de parâmetros) do
// grupo, a matriz de mundo local vem de `transform_fn` e a de normais é a inversa transposta do bloco 3×3 (bloco
// singular: as normais ficam como as do TRS). Matriz com valor não finito mantém a do TRS, já composta neste quadro.
// Roda depois da composição de todos os slots e antes dos níveis da hierarquia (um filho com função compõe sobre o
// pai a partir desta matriz local).
// Requer: structs Transform, WorldTransform, TransformFnRecord, TransformFnGroup; transform_fn (ponto); linalg.

@compute @workgroup_size(WORKGROUP_SIZE)
fn transform_compose_fn_main(
    @builtin(global_invocation_id) gid3: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
) {
    let k = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    if (k >= transform_fn_group.count) { return; }
    let pair = transform_fn_pairs[transform_fn_group.first + k];
    let data = transform_fn_params(transform_fn_records[pair.y]);
    let m = transform_fn(pair.x, transforms[pair.x], data, transform_fn_group.time);
    if (!finite_mat4(m)) { return; }
    worlds[pair.x].world = m;
    let b = mat3x3f(m[0].xyz, m[1].xyz, m[2].xyz);
    let det = mat3_det(b);
    if (abs(det) > 1e-20) {
        worlds[pair.x].normal = mat3_transpose(mat3_inverse(b));
    }
}
