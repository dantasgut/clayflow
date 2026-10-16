// Redução (Reduce, research R11): árvore por grupo de 256 em memória de workgroup; o resultado de cada grupo vai para
// `reduce_out[reduce_level.out_index + grupo]`. Os níveis se repetem até restar um valor. Operação, tipo e identidade
// vêm do módulo de operação (`reduceOp`): `ReduceT`, `REDUCE_IDENTITY`, `reduce_op`.

var<workgroup> reduce_wg: array<ReduceT, 256>;

@compute @workgroup_size(256)
fn reduce_main(
    @builtin(global_invocation_id) gid3: vec3u,
    @builtin(local_invocation_id)  lid:  vec3u,
    @builtin(workgroup_id)         wgid: vec3u,
    @builtin(num_workgroups)       nwg:  vec3u,
) {
    let i     = gid3.x + gid3.y * nwg.x * 256u;
    let group = wgid.x + wgid.y * nwg.x;
    let n     = reduce_count();
    let li    = lid.x;

    var v = REDUCE_IDENTITY;
    if (i < n) { v = reduce_in[i]; }
    reduce_wg[li] = v;
    workgroupBarrier();
    for (var stride = 128u; stride > 0u; stride >>= 1u) {
        if (li < stride) { reduce_wg[li] = reduce_op(reduce_wg[li], reduce_wg[li + stride]); }
        workgroupBarrier();
    }
    if (li == 0u && group * 256u < n) { reduce_out[reduce_level.out_index + group] = reduce_wg[0]; }
}
