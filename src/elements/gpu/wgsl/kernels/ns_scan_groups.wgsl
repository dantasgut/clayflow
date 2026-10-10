// Soma de prefixos exclusiva do nível de topo (≤ 256 elementos), num único grupo, no próprio buffer
// (spec 004, R17).
@group(0) @binding(0) var<uniform>             level:  NsScanLevel;
@group(1) @binding(0) var<storage, read_write> values: array<u32>;

var<workgroup> shared_gs: array<u32, 256>;

@compute @workgroup_size(256)
fn ns_scan_groups_main(
    @builtin(local_invocation_id) lid: vec3u,
) {
    let n       = level.count;
    let local_i = lid.x;

    shared_gs[local_i] = select(0u, values[min(local_i, n - 1u)], local_i < n);
    workgroupBarrier();

    // Hillis-Steele inclusiva
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

    // Inclusiva → exclusiva
    let excl = select(0u, shared_gs[max(local_i, 1u) - 1u], local_i > 0u);
    if (local_i < n) {
        values[local_i] = excl;
    }
}
