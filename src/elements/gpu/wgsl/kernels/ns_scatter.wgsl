// portado de legacy/elements/physics/gpu/wgsl/kernels/ns_scatter.wgsl.ts

@compute @workgroup_size(WORKGROUP_SIZE)
fn ns_scatter_main(
    @builtin(global_invocation_id) gid3: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
) {
    // Índice linear: despacho distribuído em x/y dentro do limite por dimensão (Dispatcher.invocations).
    let gid = vec3u(gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE, 0u, 0u);
    let i = gid.x;
    if (i >= ns_params.particle_count) { return; }  // particle_count

    let cell = cell_ids[i];
    if (cell == NONE) { return; }  // NS_INVALID_CELL

    let pos = atomicAdd(&cell_cursor[cell], 1u);
    sorted_particles[pos] = i;
    // A ordem por célula (+ 1; 0 é posto vazio): `ns_sort_cells` a refaz dentro de cada célula da grade; na extra, das
    // partículas fora dela (nunca vizinhas de ninguém), a ordem de chegada basta.
    ns_order[pos] = i + 1u;
}
