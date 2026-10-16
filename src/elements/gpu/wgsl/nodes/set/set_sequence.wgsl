// Nó `set.sequence` (spec 031): conjunto u32 `start + i · step`, i < count — a fonte dos nós das primitivas.
// Requer: set_common, sequence, set_u32_out.

@compute @workgroup_size(SCAN_GROUP)
fn sequence_main(@builtin(global_invocation_id) gid: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let i = set_invocation(gid, nwg);
    if (i >= sequence.count) { return; }
    set_u32_out[i] = sequence.start + i * sequence.step;
}
