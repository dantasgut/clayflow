// As listas do quadro no pool do corpo de água (spec 034, T066d; `field_drops.wgsl`), por corpo (uma região da junção):
// - a gota deste corpo passada à película (`field_film_absorb_main`) é retirada — parada muito abaixo da cena
//   (`FLUID_RETIRED_Y`), como a que sai do domínio aberto: a película a devolve num pingo;
// - o pedido de pingo de ordem `r` pela chave da célula (o empate pela palavra) volta na retirada do `r`-ésimo balde
//   ocupado: se ela é deste corpo, a partícula vai à posição do pingo (a anterior igual, parada; o resto do registro
//   fica) e a célula perde exatamente o volume dela. A escolha não depende da ordem dos atômicos.
// Requer: WORKGROUP_SIZE, NONE, field_gather, field_particles_rw, field_drips_read, field_drops, FIELD_FILM_DRIPS,
// fluid_bounds, fluid_field, field_common, field_film, field_film_update.

/** Põe a partícula do registro `base` (em `vec4f`) parada em `p`. */
fn field_place(base: u32, p: vec3f) {
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

/** O registro (em `vec4f`) do item `item` do array compacto, se ele é deste corpo (ou `NONE`). */
fn field_revive_record(item: u32) -> u32 {
    if (item == NONE || item < field_gather.base || item >= field_gather.base + field_gather.count) { return NONE; }
    return (field_gather.first + item - field_gather.base) * field_gather.strideVec4;
}

@compute @workgroup_size(WORKGROUP_SIZE)
fn field_revive_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let k = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    if (k >= FIELD_FILM_DRIPS) { return; }
    // A gota passada à película.
    let absorbed = field_revive_record(field_drop_item(field_drips_read[field_absorb_word(k)]));
    if (absorbed != NONE) {
        let p = field_particles_rw[absorbed + field_gather.posOffsetVec4].xyz;
        field_place(absorbed, vec3f(p.x, FLUID_RETIRED_Y, p.z));
    }
    // O pingo k: a ordem dele entre os pedidos pela chave (e pela palavra no empate).
    let requests = min(field_drips_read[field_drip_count_word()], FIELD_FILM_DRIPS);
    if (k >= requests) { return; }
    let o = field_drip_word(k);
    let key = field_drips_read[o];
    let word = field_drips_read[o + 1u];
    var rank = 0u;
    for (var j = 0u; j < requests; j++) {
        let other = field_drips_read[field_drip_word(j)];
        let other_word = field_drips_read[field_drip_word(j) + 1u];
        if (other < key || (other == key && other_word < word)) { rank++; }
    }
    // O balde ocupado de mesma ordem.
    var item = NONE;
    var seen = 0u;
    for (var b = 0u; b < FIELD_FILM_DRIPS; b++) {
        let it = field_drop_item(field_drips_read[field_retired_word(b)]);
        if (it == NONE) { continue; }
        if (seen == rank) {
            item = it;
            break;
        }
        seen++;
    }
    let record = field_revive_record(item);
    if (record == NONE) { return; }
    atomicSub(&field_film_cells[word + 6u], field_film_particle_units());
    field_place(record, vec3f(
        bitcast<f32>(field_drips_read[o + 2u]),
        bitcast<f32>(field_drips_read[o + 3u]),
        bitcast<f32>(field_drips_read[o + 4u]),
    ));
}
