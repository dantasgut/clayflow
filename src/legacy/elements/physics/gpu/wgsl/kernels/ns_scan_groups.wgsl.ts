/**
 * Kernel WGSL: ns_scan_groups — prefix scan das somas de workgroup (nível 1).
 *
 * Único workgroup de 256 threads que escaneia group_sums[] in-place.
 * Converte group_sums de contagens por grupo para offsets exclusivos.
 *
 * Bind groups:
 *   @group(0) @binding(0) — NsSimParams (uniform)
 *   @group(1) @binding(0) — group_sums: array<u32> (read_write)
 *
 * Dispatch: 1 workgroup.
 * Restrição: ceil(n_cells / 256) ≤ 256 → n_cells ≤ 65536.
 */
export const WGSL_KERNEL_NS_SCAN_GROUPS = /* wgsl */`

@group(0) @binding(0) var<uniform>             ns_params:  NsSimParams;
@group(1) @binding(0) var<storage, read_write> group_sums: array<u32>;

var<workgroup> shared_gs: array<u32, 256>;

@compute @workgroup_size(256)
fn ns_scan_groups_main(
    @builtin(global_invocation_id) gid:  vec3u,
    @builtin(local_invocation_id)  lid:  vec3u,
) {
    let n_groups = (ns_params.dims.w + 255u) / 256u;
    let local_i  = lid.x;

    shared_gs[local_i] = select(0u, group_sums[local_i], local_i < n_groups);
    workgroupBarrier();

    // Hillis-Steele inclusive scan
    var offset = 1u;
    loop {
        if (offset >= 256u) { break; }
        var val = shared_gs[local_i];
        if (local_i >= offset) {
            val += shared_gs[local_i - offset];
        }
        workgroupBarrier();
        shared_gs[local_i] = val;
        workgroupBarrier();
        offset <<= 1u;
    }

    // Converte inclusive → exclusivo
    let excl = select(0u, shared_gs[local_i - 1u], local_i > 0u);

    if (local_i < n_groups) {
        group_sums[local_i] = excl;
    }
}
`;
