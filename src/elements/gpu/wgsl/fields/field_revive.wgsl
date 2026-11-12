// O pingo no pool do corpo de água (spec 034, T066d; `field_film_drip.wgsl`): por corpo (uma região da junção), cada
// pingo pedido no quadro cuja retirada é deste corpo volta ao pool — a posição dele, a anterior igual (parado) e a
// velocidade zero; o resto do registro fica.
// Requer: WORKGROUP_SIZE, NONE, field_gather, field_particles_rw, field_drips_read, FIELD_FILM_DRIPS.

@compute @workgroup_size(WORKGROUP_SIZE)
fn field_revive_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let k = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    let claimed = min(field_drips_read[1], min(field_drips_read[0], FIELD_FILM_DRIPS));
    if (k >= claimed || field_drips_read[2u + 2u * k] != field_gather.body) { return; }
    let o = 2u + 2u * FIELD_FILM_DRIPS + 4u * k;
    if (field_drips_read[o + 3u] == 0u) { return; }
    let p = vec3f(
        bitcast<f32>(field_drips_read[o]),
        bitcast<f32>(field_drips_read[o + 1u]),
        bitcast<f32>(field_drips_read[o + 2u]),
    );
    let base = field_drips_read[3u + 2u * k] * field_gather.strideVec4;
    let at = base + field_gather.posOffsetVec4;
    field_particles_rw[at] = vec4f(p, field_particles_rw[at].w);
    if (field_gather.posOldOffsetVec4 != NONE) {
        let old = base + field_gather.posOldOffsetVec4;
        field_particles_rw[old] = vec4f(p, field_particles_rw[old].w);
    }
    if (field_gather.velOffsetVec4 != NONE) {
        let v = base + field_gather.velOffsetVec4;
        field_particles_rw[v] = vec4f(0.0, 0.0, 0.0, field_particles_rw[v].w);
    }
}
