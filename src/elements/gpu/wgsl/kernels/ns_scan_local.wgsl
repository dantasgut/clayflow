// Soma de prefixos exclusiva por grupo de 256 (um nível da soma hierárquica — spec 004, R17).
// `dst[i]` = soma exclusiva de `src` dentro do grupo de `i`; `group_sums[g]` = total do grupo `g`.
@group(0) @binding(0) var<uniform>             level:      NsScanLevel;
@group(1) @binding(0) var<storage, read>       src:        array<u32>;
@group(1) @binding(1) var<storage, read_write> dst:        array<u32>;
@group(1) @binding(2) var<storage, read_write> group_sums: array<u32>;

var<workgroup> wg_data: array<u32, 256>;

@compute @workgroup_size(256)
fn ns_scan_local_main(
    @builtin(global_invocation_id) gid3: vec3u,
    @builtin(local_invocation_id)  lid:  vec3u,
    @builtin(workgroup_id)         wgid: vec3u,
    @builtin(num_workgroups)       nwg:  vec3u,
) {
    // Índice linear: despacho distribuído em x/y dentro do limite por dimensão (Dispatcher.invocations).
    let gid     = vec3u(gid3.x + gid3.y * nwg.x * 256u, 0u, 0u);
    let group   = wgid.x + wgid.y * nwg.x;
    let n       = level.count;
    let i       = gid.x;
    let local_i = lid.x;

    // Carrega (0 fora dos limites). Sem retorno antecipado: todos chegam às barreiras.
    wg_data[local_i] = select(0u, src[min(i, n - 1u)], i < n);
    workgroupBarrier();

    // Hillis-Steele inclusiva
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

    if (local_i == 255u) {
        group_sums[group] = wg_data[255];
    }

    // Inclusiva → exclusiva
    let excl = select(0u, wg_data[max(local_i, 1u) - 1u], local_i > 0u);
    if (i < n) {
        dst[i] = excl;
    }
}
