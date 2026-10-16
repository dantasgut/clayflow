// Nível de topo da soma de prefixos (PrefixSum, research R8): ≤ 256 elementos num único grupo, no lugar.

var<workgroup> scan_top_wg: array<u32, SCAN_GROUP>;

@compute @workgroup_size(SCAN_GROUP)
fn scan_top_main(@builtin(local_invocation_id) lid: vec3u) {
    let n  = level.count;
    let li = lid.x;

    var v = 0u;
    if (li < n) { v = values[li]; }
    scan_top_wg[li] = v;
    workgroupBarrier();

    for (var offset = 1u; offset < SCAN_GROUP; offset <<= 1u) {
        var acc = scan_top_wg[li];
        if (li >= offset) { acc += scan_top_wg[li - offset]; }
        workgroupBarrier();
        scan_top_wg[li] = acc;
        workgroupBarrier();
    }

    let incl = scan_top_wg[li];
    if (li < n) { values[li] = select(incl - v, incl, level.inclusive != 0u); }
}
