// Grade hash: põe o índice de cada item no seu balde, a partir do início do balde (cursores = soma de prefixos).

@compute @workgroup_size(WORKGROUP_SIZE)
fn sh_scatter_main(
    @builtin(global_invocation_id) gid3: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
) {
    let i = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    if (i >= grid.count) { return; }
    let item = items[i];
    if (item.w < 0.0) { return; }
    let bucket = sh_hash(sh_cell(item.xyz, grid.cell_size), grid.table_mask);
    cell_items[atomicAdd(&cursors[bucket], 1u)] = i;
}
