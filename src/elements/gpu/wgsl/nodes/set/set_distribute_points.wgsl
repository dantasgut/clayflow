// Nó `set.distributeOnMesh` (spec 031): o ponto i é o candidato aceito `distribute_list[i]` (posição e normal).
// Despacho indireto pelo registro `SetCount` dos pontos.
// Requer: set_common, set_count, distribute_sample, distribute_list, set_points_out.

@compute @workgroup_size(SCAN_GROUP)
fn distribute_points_main(@builtin(global_invocation_id) gid: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let i = set_invocation(gid, nwg);
    if (i >= set_count_level(distribute.points_slot, 0u)) { return; }
    let s = distribute_sample(distribute_list[i]);
    set_points_out[i] = SetPoint(s.position.x, s.position.y, s.position.z, s.normal.x, s.normal.y, s.normal.z);
}
