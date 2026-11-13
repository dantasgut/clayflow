// portado de legacy/elements/physics/gpu/wgsl/kernels/ns_assign_count.wgsl.ts
const NS_INVALID_CELL: u32 = NONE;

@compute @workgroup_size(WORKGROUP_SIZE)
fn ns_assign_count_main(
    @builtin(global_invocation_id) gid3: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
) {
    // Índice linear: despacho distribuído em x/y dentro do limite por dimensão (Dispatcher.invocations).
    let gid = vec3u(gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE, 0u, 0u);
    let i = gid.x;
    if (i >= ns_params.particle_count) { return; }  // counts.x = particle_count
    // Slot livre (faixa liberada): fora da grade, nunca vizinho de ninguém.
    if (!pool_live(live[i >> 5u], i)) {
        cell_ids[i] = NS_INVALID_CELL;
        return;
    }

    let stride = ns_params.particle_stride;  // particle_stride_f32
    let px = particle_data[i * stride + 0u];
    let py = particle_data[i * stride + 1u];
    let pz = particle_data[i * stride + 2u];

    let origin    = ns_params.origin;
    let cell_size = ns_params.cell_size;
    let table = vec3u(ns_params.grid_x, ns_params.grid_y, ns_params.grid_z);
    let domain = vec3u(ns_params.domain_x, ns_params.domain_y, ns_params.domain_z);

    // Coordenadas da grade do domínio e a célula da tabela.
    let q = vec3i(floor((vec3f(px, py, pz) - origin) / cell_size));
    let cell = ns_table_cell(q, domain, table);

    // Fora do domínio → a célula extra depois da tabela: nunca vizinha de ninguém, mas na ordem por célula (quem roda
    // nessa ordem a processa).
    if (cell == NONE) {
        let outside = table.x * table.y * table.z;
        cell_ids[i] = outside;
        atomicAdd(&cell_count[outside], 1u);
        return;
    }

    cell_ids[i] = cell;
    atomicAdd(&cell_count[cell], 1u);
}
