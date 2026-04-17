/**
 * Kernel WGSL: ns_scan_combine — adiciona offset de grupo ao prefix local (nível 2).
 *
 * Para cada célula i: cell_start[i] += group_sums[workgroup_of_i]
 * Resulta no prefix exclusivo global correto.
 *
 * Bind groups:
 *   @group(0) @binding(0) — NsSimParams (uniform)
 *   @group(1) @binding(0) — cell_start: array<u32> (read_write)
 *   @group(1) @binding(1) — group_sums: array<u32> (read) — offsets de grupo (já escaneados)
 *
 * Dispatch: ceil(n_cells / 256) workgroups.
 */
export const WGSL_KERNEL_NS_SCAN_COMBINE = /* wgsl */`

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
`;
