// Um nível da soma de prefixos (PrefixSum, research R8): soma dentro de cada grupo de 256, no lugar, e o total de
// cada grupo escrito no nível de cima. Exclusiva, ou inclusiva quando `level.inclusive` ≠ 0 (só no nível 0).
@group(0) @binding(0) var<uniform>             level:      ScanLevel;
@group(1) @binding(0) var<storage, read_write> values:     array<u32>;
@group(1) @binding(1) var<storage, read_write> group_sums: array<u32>;

var<workgroup> scan_local_wg: array<u32, 256>;

@compute @workgroup_size(256)
fn scan_local_main(
    @builtin(global_invocation_id) gid3: vec3u,
    @builtin(local_invocation_id)  lid:  vec3u,
    @builtin(workgroup_id)         wgid: vec3u,
    @builtin(num_workgroups)       nwg:  vec3u,
) {
    // Índice linear: despacho distribuído em x/y (Dispatcher.invocations).
    let i     = gid3.x + gid3.y * nwg.x * 256u;
    let group = wgid.x + wgid.y * nwg.x;
    let n     = level.count;
    let li    = lid.x;

    var v = 0u;
    if (i < n) { v = values[i]; }
    scan_local_wg[li] = v;
    workgroupBarrier();

    // Hillis–Steele inclusiva. Sem retorno antecipado: todos chegam às barreiras.
    for (var offset = 1u; offset < 256u; offset <<= 1u) {
        var acc = scan_local_wg[li];
        if (li >= offset) { acc += scan_local_wg[li - offset]; }
        workgroupBarrier();
        scan_local_wg[li] = acc;
        workgroupBarrier();
    }

    let incl = scan_local_wg[li];
    // Grupos além do último (linha final do despacho em x/y) não escrevem total.
    if (li == 255u && group * 256u < n) { group_sums[group] = incl; }
    if (i < n) { values[i] = select(incl - v, incl, level.inclusive != 0u); }
}
