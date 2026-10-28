// A tabela da película de água nos sólidos escrita com atômicos (`field_film.wgsl`, spec 034): a busca e a inserção
// de uma célula, e a deposição por partícula. A massa da película se conserva no escoamento: o que sai de uma célula
// entra na outra, em ponto fixo.
// Requer: WORKGROUP_SIZE, NONE, fluid_field, field_common, field_film, field_data_atomic.

/** Célula `c` da película: o índice da que tem a chave, inserida se `insert` (ou `NONE`). */
fn field_film_find(c: vec3i, insert: bool) -> u32 {
    let key = field_film_key(c);
    if (key == 0u) { return NONE; }
    var slot = field_film_bucket(c);
    for (var k = 0u; k < FIELD_FILM_PROBES; k++) {
        let w = field_film_word(slot);
        let found = atomicLoad(&field_data_atomic[w]);
        if (found == key) { return slot; }
        if (found == 0u) {
            if (!insert) { return NONE; }
            let old = atomicCompareExchangeWeak(&field_data_atomic[w], 0u, key);
            if (old.exchanged || old.old_value == key) { return slot; }
            if (old.old_value == 0u) { continue; }
        }
        slot = (slot + 1u) & fluid_field.film.y;
    }
    return NONE;
}
