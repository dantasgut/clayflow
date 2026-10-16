// Descida de um nível da soma de prefixos (PrefixSum, research R8): soma a cada elemento o prefixo do seu grupo.

@compute @workgroup_size(SCAN_GROUP)
fn scan_combine_main(
    @builtin(global_invocation_id) gid3: vec3u,
    @builtin(workgroup_id)         wgid: vec3u,
    @builtin(num_workgroups)       nwg:  vec3u,
) {
    let i = gid3.x + gid3.y * nwg.x * SCAN_GROUP;
    if (i >= scan_count()) { return; }
    values[i] += group_prefix[wgid.x + wgid.y * nwg.x];
}
