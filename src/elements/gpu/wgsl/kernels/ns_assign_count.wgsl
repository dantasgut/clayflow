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
    let gx = ns_params.grid_x;
    let gy = ns_params.grid_y;
    let gz = ns_params.grid_z;

    // Coordenadas de célula
    let ix = i32(floor((px - origin.x) / cell_size));
    let iy = i32(floor((py - origin.y) / cell_size));
    let iz = i32(floor((pz - origin.z) / cell_size));

    // Fora do volume: a célula de fora da grade (a última, `cell_count`) — sem vizinhos e não é vizinha de ninguém, mas
    // entra na ordem por célula (os estágios que andam nela a processam).
    var cell = ns_params.cell_count;
    if (ix >= 0 && iy >= 0 && iz >= 0 && u32(ix) < gx && u32(iy) < gy && u32(iz) < gz) {
        cell = u32(ix) + u32(iy) * gx + u32(iz) * gx * gy;
    }
    cell_ids[i] = cell;
    atomicAdd(&cell_count[cell], 1u);
}
