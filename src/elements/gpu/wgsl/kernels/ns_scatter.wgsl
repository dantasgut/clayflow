// portado de legacy/elements/physics/gpu/wgsl/kernels/ns_scatter.wgsl.ts
@group(0) @binding(0) var<uniform>             ns_params:        NsSimParams;
@group(1) @binding(0) var<storage, read>       cell_ids:         array<u32>;
@group(1) @binding(1) var<storage, read_write> cell_cursor:      array<atomic<u32>>;
@group(1) @binding(2) var<storage, read_write> sorted_particles: array<u32>;

@compute @workgroup_size(64)
fn ns_scatter_main(@builtin(global_invocation_id) gid: vec3u) {
    let i = gid.x;
    if (i >= ns_params.counts.x) { return; }  // particle_count

    let cell = cell_ids[i];
    if (cell == 0xFFFFFFFFu) { return; }  // NS_INVALID_CELL

    let pos = atomicAdd(&cell_cursor[cell], 1u);
    sorted_particles[pos] = i;
}
