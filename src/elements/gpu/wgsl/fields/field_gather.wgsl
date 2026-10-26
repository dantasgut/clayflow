// Junção das partículas dos fluidos com superfície (spec 033, R11): por corpo (uma região do uniform por corpo), a
// posição de cada partícula viva do pool vai ao array compacto `field_items` (xyz; w = o corpo, índice + 1, ≥ 1); a
// partícula de slot livre fica fora (w < 0: a grade de vizinhança e a marcação a ignoram).
// Depois da grade, `field_sort_main` (`field_sort.wgsl`) copia as partículas na ordem das células.
// Requer: WORKGROUP_SIZE, field_gather, field_particles, field_live, pool_live, field_items (escrita).

@compute @workgroup_size(WORKGROUP_SIZE)
fn field_gather_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let i = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    if (i >= field_gather.count) { return; }
    let slot = field_gather.first + i;
    let p = field_particles[slot * field_gather.strideVec4 + field_gather.posOffsetVec4].xyz;
    let live = pool_live(field_live[slot >> 5u], slot) && all(abs(p) < vec3f(1e6));
    field_items[field_gather.base + i] = vec4f(p, select(-1.0, f32(field_gather.body), live));
}
