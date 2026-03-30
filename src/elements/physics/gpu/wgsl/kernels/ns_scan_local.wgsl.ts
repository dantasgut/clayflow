/**
 * Kernel WGSL: ns_scan_local — prefix scan local (nível 0 de scan de 2 níveis).
 *
 * Cada workgroup (256 threads) calcula o prefix scan exclusivo do seu bloco de 256 células.
 * Ao final, group_sums[workgroup_id] = soma total do bloco.
 *
 * Algoritmo: Hillis-Steele inclusive scan em shared memory → converte para exclusivo.
 *
 * Bind groups:
 *   @group(0) @binding(0) — NsSimParams (uniform)
 *   @group(1) @binding(0) — cell_count: array<u32> (read) — contagens por célula
 *   @group(1) @binding(1) — cell_start: array<u32> (read_write) — prefix scan de saída (exclusivo)
 *   @group(1) @binding(2) — group_sums: array<u32> (read_write) — soma por workgroup
 *
 * Dispatch: ceil(n_cells / 256) workgroups.
 * Restrição: n_cells ≤ 65536 (256 workgroups × 256 threads).
 */
export const WGSL_KERNEL_NS_SCAN_LOCAL = /* wgsl */`

@group(0) @binding(0) var<uniform>             ns_params:   NsSimParams;
@group(1) @binding(0) var<storage, read>       cell_count:  array<u32>;
@group(1) @binding(1) var<storage, read_write> cell_start:  array<u32>;
@group(1) @binding(2) var<storage, read_write> group_sums:  array<u32>;

var<workgroup> shared: array<u32, 256>;

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
    shared[local_i] = select(0u, cell_count[i], i < n_cells);
    workgroupBarrier();

    // Hillis-Steele inclusive scan
    var offset = 1u;
    loop {
        if (offset >= 256u) { break; }
        var val = shared[local_i];
        if (local_i >= offset) {
            val += shared[local_i - offset];
        }
        workgroupBarrier();
        shared[local_i] = val;
        workgroupBarrier();
        offset <<= 1u;
    }

    // Guarda soma total do grupo antes de converter para exclusivo
    if (local_i == 255u) {
        group_sums[wgid.x] = shared[255];
    }

    // Converte inclusive → exclusivo (shift right: value = shared[i-1], first = 0)
    let excl = select(0u, shared[local_i - 1u], local_i > 0u);

    if (i < n_cells) {
        cell_start[i] = excl;
    }
}
`;
