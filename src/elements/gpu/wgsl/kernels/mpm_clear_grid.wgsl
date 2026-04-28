// novo (não-portado) — clear da grid antes do P2G a cada substep
@group(0) @binding(0) var<uniform>             mpm_params: MPMSimParams;
@group(1) @binding(0) var<storage, read_write> grid:       array<MPMGridNode>;

@compute @workgroup_size(64)
fn mpm_clear_grid_main(@builtin(global_invocation_id) gid: vec3u) {
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
