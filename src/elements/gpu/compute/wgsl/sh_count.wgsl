// Grade hash: conta os itens de cada balde. Item com `w < 0` fica fora da grade (tratado à parte por quem consulta).

@compute @workgroup_size(WORKGROUP_SIZE)
fn sh_count_main(
    @builtin(global_invocation_id) gid3: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
) {
    let i = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    if (i >= grid.count) { return; }
    let item = items[i];
    if (item.w < 0.0) { return; }
    atomicAdd(&counts[sh_hash(sh_cell(item.xyz, grid.cell_size), grid.table_mask)], 1u);
}
