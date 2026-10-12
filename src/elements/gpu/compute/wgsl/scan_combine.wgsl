// Descida de um nível da soma de prefixos (PrefixSum, research R8): soma a cada elemento o prefixo do seu grupo.
@group(0) @binding(0) var<uniform>             level:        ScanLevel;
@group(1) @binding(0) var<storage, read_write> values:       array<u32>;
@group(1) @binding(1) var<storage, read>       group_prefix: array<u32>;

@compute @workgroup_size(256)
fn scan_combine_main(
    @builtin(global_invocation_id) gid3: vec3u,
    @builtin(workgroup_id)         wgid: vec3u,
    @builtin(num_workgroups)       nwg:  vec3u,
) {
    let i = gid3.x + gid3.y * nwg.x * 256u;
    if (i >= level.count) { return; }
    values[i] += group_prefix[wgid.x + wgid.y * nwg.x];
}
