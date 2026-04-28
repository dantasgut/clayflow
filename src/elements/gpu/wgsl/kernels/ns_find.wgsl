// portado de legacy/elements/physics/gpu/wgsl/kernels/ns_find.wgsl.ts
@group(0) @binding(0) var<uniform>             ns_params:       NsSimParams;
@group(1) @binding(0) var<storage, read>       particle_data:   array<f32>;
@group(1) @binding(1) var<storage, read>       cell_start:      array<u32>;
@group(1) @binding(2) var<storage, read>       cell_count_buf:  array<u32>;
@group(1) @binding(3) var<storage, read>       sorted_particles: array<u32>;
@group(1) @binding(4) var<storage, read_write> neighbor_list:   array<u32>;
@group(1) @binding(5) var<storage, read_write> neighbor_count:  array<u32>;

@compute @workgroup_size(64)
fn ns_find_main(@builtin(global_invocation_id) gid: vec3u) {
    let i = gid.x;
    if (i >= ns_params.counts.x) { return; }

    let stride    = ns_params.counts.y;
    let max_nb    = ns_params.counts.z;
    let h         = ns_params.origin_cell.w;
    let h_sq      = h * h;
    let origin    = ns_params.origin_cell.xyz;
    let cell_size = h;
    let gx        = ns_params.dims.x;
    let gy        = ns_params.dims.y;
    let gz        = ns_params.dims.z;
    let n_cells   = ns_params.dims.w;

    let px = particle_data[i * stride + 0u];
    let py = particle_data[i * stride + 1u];
    let pz = particle_data[i * stride + 2u];

    let ix0 = i32(floor((px - origin.x) / cell_size));
    let iy0 = i32(floor((py - origin.y) / cell_size));
    let iz0 = i32(floor((pz - origin.z) / cell_size));

    var nb_count: u32 = 0u;
    let list_base = i * max_nb;

    // Stencil 3×3×3
    for (var dz: i32 = -1; dz <= 1; dz++) {
    for (var dy: i32 = -1; dy <= 1; dy++) {
    for (var dx: i32 = -1; dx <= 1; dx++) {
        let nx = ix0 + dx;
        let ny = iy0 + dy;
        let nz = iz0 + dz;

        if (nx < 0 || ny < 0 || nz < 0
         || u32(nx) >= gx || u32(ny) >= gy || u32(nz) >= gz) { continue; }

        let cell = u32(nx) + u32(ny) * gx + u32(nz) * gx * gy;
        let start = cell_start[cell];
        let count = cell_count_buf[cell];

        for (var k: u32 = 0u; k < count; k++) {
            let j = sorted_particles[start + k];
            if (j == i) { continue; }

            let qx = particle_data[j * stride + 0u] - px;
            let qy = particle_data[j * stride + 1u] - py;
            let qz = particle_data[j * stride + 2u] - pz;
            let dist_sq = qx*qx + qy*qy + qz*qz;

            if (dist_sq < h_sq && nb_count < max_nb) {
                neighbor_list[list_base + nb_count] = j;
                nb_count++;
            }
        }
    }}}

    neighbor_count[i] = nb_count;
}
