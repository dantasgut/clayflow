// portado de legacy/elements/physics/gpu/wgsl/kernels/ns_scan_combine.wgsl.ts
@group(0) @binding(0) var<uniform>             ns_params:  NsSimParams;
@group(1) @binding(0) var<storage, read_write> cell_start: array<u32>;
@group(1) @binding(1) var<storage, read>       group_sums: array<u32>;

@compute @workgroup_size(256)
fn ns_scan_combine_main(
    @builtin(global_invocation_id) gid:  vec3u,
    @builtin(workgroup_id)         wgid: vec3u,
) {
    let i       = gid.x;
    let n_cells = ns_params.dims.w;
    if (i >= n_cells) { return; }

    cell_start[i] += group_sums[wgid.x];
}
