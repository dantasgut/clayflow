// Grade hash: põe o índice de cada item no seu balde, a partir do início do balde (cursores = soma de prefixos).
@group(0) @binding(0) var<uniform>             grid:       HashGridParams;
@group(0) @binding(1) var<storage, read>       items:      array<vec4f>;
@group(0) @binding(2) var<storage, read_write> cursors:    array<atomic<u32>>;
@group(0) @binding(3) var<storage, read_write> cell_items: array<u32>;

@compute @workgroup_size(64)
fn sh_scatter_main(
    @builtin(global_invocation_id) gid3: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
) {
    let i = gid3.x + gid3.y * nwg.x * 64u;
    if (i >= grid.count) { return; }
    let item = items[i];
    if (item.w < 0.0) { return; }
    let bucket = sh_hash(sh_cell(item.xyz, grid.cell_size), grid.table_mask);
    cell_items[atomicAdd(&cursors[bucket], 1u)] = i;
}
