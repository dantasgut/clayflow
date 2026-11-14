// Inversa de mundo (spec 037, R4): para cada slot, a inversa afim da matriz de mundo já composta (TRS, função e níveis
// da hierarquia), no pool `WorldInverse` — só despachado quando algum estágio pediu o pool.
// Requer: structs WorldTransform, WorldInverse, TransformParams; xform_affine.

@compute @workgroup_size(WORKGROUP_SIZE)
fn transform_inverse_main(
    @builtin(global_invocation_id) gid3: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
) {
    let i = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    if (i >= params.count) { return; }
    world_inverses[i].inverse = affine_inverse(worlds[i].world);
}
