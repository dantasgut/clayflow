// novo (não-portado) — clear da grid antes do P2G a cada substep

@compute @workgroup_size(WORKGROUP_SIZE)
fn mpm_clear_grid_main(
    @builtin(global_invocation_id) gid3: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
) {
    // Índice linear: despacho distribuído em x/y dentro do limite por dimensão (Dispatcher.invocations).
    let gid = vec3u(gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE, 0u, 0u);
    let idx = gid.x;
    let total = mpm_params.grid_x * mpm_params.grid_y * mpm_params.grid_z;
    if (idx >= total) { return; }
    atomicStore(&grid[idx].mass_i32,  0);
    atomicStore(&grid[idx].mom_x_i32, 0);
    atomicStore(&grid[idx].mom_y_i32, 0);
    atomicStore(&grid[idx].mom_z_i32, 0);
    grid[idx].vel = vec3f(0.0, 0.0, 0.0);
    grid[idx]._pad = 0.0;
}
