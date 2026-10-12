// Ordenação radix (RadixSort, research R9), passo 1 de cada passe: contagem dos 16 dígitos (4 bits a partir de
// `radix.shift`) por grupo de 256, no layout dígito-maior `hist[d × grupos + g]` — a soma de prefixos exclusiva desse
// histograma dá a base global de cada (dígito, grupo).
@group(0) @binding(0) var<uniform>             radix: RadixParams;
@group(1) @binding(0) var<storage, read>       keys:  array<u32>;
@group(1) @binding(1) var<storage, read_write> hist:  array<u32>;

var<workgroup> radix_hist_wg: array<atomic<u32>, 16>;

@compute @workgroup_size(256)
fn radix_histogram_main(
    @builtin(global_invocation_id) gid3: vec3u,
    @builtin(local_invocation_id)  lid:  vec3u,
    @builtin(workgroup_id)         wgid: vec3u,
    @builtin(num_workgroups)       nwg:  vec3u,
) {
    let i     = gid3.x + gid3.y * nwg.x * 256u;
    let group = wgid.x + wgid.y * nwg.x;
    if (lid.x < 16u) { atomicStore(&radix_hist_wg[lid.x], 0u); }
    workgroupBarrier();
    if (i < radix.count) {
        atomicAdd(&radix_hist_wg[(keys[i] >> radix.shift) & 15u], 1u);
    }
    workgroupBarrier();
    if (lid.x < 16u && group < radix.groups) {
        hist[lid.x * radix.groups + group] = atomicLoad(&radix_hist_wg[lid.x]);
    }
}
