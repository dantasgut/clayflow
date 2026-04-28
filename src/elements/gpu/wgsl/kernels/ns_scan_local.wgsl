// portado de legacy/elements/physics/gpu/wgsl/kernels/ns_scan_local.wgsl.ts
@group(0) @binding(0) var<uniform>             ns_params:   NsSimParams;
@group(1) @binding(0) var<storage, read>       cell_count:  array<u32>;
@group(1) @binding(1) var<storage, read_write> cell_start:  array<u32>;
@group(1) @binding(2) var<storage, read_write> group_sums:  array<u32>;

var<workgroup> wg_data: array<u32, 256>;

@compute @workgroup_size(256)
fn ns_scan_local_main(
    @builtin(global_invocation_id) gid:   vec3u,
    @builtin(local_invocation_id)  lid:   vec3u,
    @builtin(workgroup_id)         wgid:  vec3u,
) {
    let n_cells = ns_params.dims.w;
    let i       = gid.x;
    let local_i = lid.x;

    // Carrega contagem (ou 0 se fora dos bounds)
    wg_data[local_i] = select(0u, cell_count[i], i < n_cells);
    workgroupBarrier();

    // Hillis-Steele inclusive scan
    var offset = 1u;
    loop {
        if (offset >= 256u) { break; }
        var val = wg_data[local_i];
        if (local_i >= offset) {
            val += wg_data[local_i - offset];
        }
        workgroupBarrier();
        wg_data[local_i] = val;
        workgroupBarrier();
        offset <<= 1u;
    }

    // Guarda soma total do grupo antes de converter para exclusivo
    if (local_i == 255u) {
        group_sums[wgid.x] = wg_data[255];
    }

    // Converte inclusive → exclusivo (shift right: value = wg_data[i-1], first = 0)
    let excl = select(0u, wg_data[local_i - 1u], local_i > 0u);

    if (i < n_cells) {
        cell_start[i] = excl;
    }
}
