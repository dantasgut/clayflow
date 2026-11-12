// O pingo da película (spec 034, T066d): a água pendente que juntou o volume de uma partícula (`fluid_field.filmShape.z`)
// volta a ser partícula — uma das retiradas do corpo de água (as que saíram do domínio aberto; a junção as lista em
// `field_drips`), posta parada logo abaixo da célula, do lado de fora do sólido. A célula perde exatamente esse volume
// (a massa se conserva: a película vira a partícula). Sem partícula retirada, a água segue pendente.
// `field_drips`: [0] as retiradas listadas, [1] os pingos pedidos, depois as retiradas (corpo, slot) e os pingos
// (posição, 1) — o pingo k é a retirada k (`field_revive_main` a põe no pool do corpo dela).
// Requer: WORKGROUP_SIZE, fluid_field, field_common, field_film, field_film_update, field_drips, FIELD_FILM_DRIPS.

/** Primeira palavra do pingo `k` em `field_drips`. */
fn field_drip_word(k: u32) -> u32 {
    return 2u + 2u * FIELD_FILM_DRIPS + 4u * k;
}

@compute @workgroup_size(WORKGROUP_SIZE)
fn field_film_drip_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let slot = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    if (slot > fluid_field.film.y) { return; }
    let w = field_film_cell_word(slot);
    let key = atomicLoad(&field_film_cells[w]);
    if (key == 0u) { return; }
    let size = field_film_size();
    let need = u32(fluid_field.filmShape.z / (f32(FIELD_FILM_DROP_UNITS) * FIELD_FILM_UNIT * size * size) + 0.5);
    if (need == 0u || atomicLoad(&field_film_cells[w + 6u]) < need) { return; }
    let available = min(atomicLoad(&field_drips[0]), FIELD_FILM_DRIPS);
    let k = atomicAdd(&field_drips[1], 1u);
    if (k >= available) { return; }
    atomicSub(&field_film_cells[w + 6u], need);
    let n = unpack4x8snorm(atomicLoad(&field_film_cells[w + 2u])).xyz;
    let down = normalize(fluid_field.filmFlow.xyz + vec3f(0.0, -1e-6, 0.0));
    let r = fluid_field.filmShape.w;
    let p = (vec3f(field_film_coords(key)) + 0.5) * size + down * (r + size) + n * r;
    let o = field_drip_word(k);
    atomicStore(&field_drips[o], bitcast<u32>(p.x));
    atomicStore(&field_drips[o + 1u], bitcast<u32>(p.y));
    atomicStore(&field_drips[o + 2u], bitcast<u32>(p.z));
    atomicStore(&field_drips[o + 3u], 1u);
}
