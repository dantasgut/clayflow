// Grade hash: conta os itens de cada balde. Item com `w < 0` fica fora da grade (tratado à parte por quem consulta).
@group(0) @binding(0) var<uniform>             grid:   HashGridParams;
@group(0) @binding(1) var<storage, read>       items:  array<vec4f>;
@group(0) @binding(2) var<storage, read_write> counts: array<atomic<u32>>;

@compute @workgroup_size(64)
fn sh_count_main(
    @builtin(global_invocation_id) gid3: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
) {
    let i = gid3.x + gid3.y * nwg.x * 64u;
    if (i >= grid.count) { return; }
    let item = items[i];
    if (item.w < 0.0) { return; }
    atomicAdd(&counts[sh_hash(sh_cell(item.xyz, grid.cell_size), grid.table_mask)], 1u);
}
