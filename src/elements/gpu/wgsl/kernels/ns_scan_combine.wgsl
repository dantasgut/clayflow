// Desce um nível da soma hierárquica: soma a cada elemento o prefixo do seu grupo (spec 004, R17).
@group(0) @binding(0) var<uniform>             level:        NsScanLevel;
@group(1) @binding(0) var<storage, read_write> dst:          array<u32>;
@group(1) @binding(1) var<storage, read>       group_prefix: array<u32>;

@compute @workgroup_size(256)
fn ns_scan_combine_main(
    @builtin(global_invocation_id) gid3: vec3u,
    @builtin(workgroup_id)         wgid: vec3u,
    @builtin(num_workgroups)       nwg:  vec3u,
) {
    // Índice linear: despacho distribuído em x/y dentro do limite por dimensão (Dispatcher.invocations).
    let gid   = vec3u(gid3.x + gid3.y * nwg.x * 256u, 0u, 0u);
    let group = wgid.x + wgid.y * nwg.x;
    let i     = gid.x;
    if (i >= level.count) { return; }
    dst[i] += group_prefix[group];
}
