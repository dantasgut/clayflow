// A tabela da película de água nos sólidos escrita com atômicos (`field_film.wgsl`, spec 034), na fatia do quadro do
// canal temporal (`field_film_cells`, T060f; constituição VII): a busca e a inserção de uma célula. A massa da película se
// conserva no escoamento: o que sai de uma célula entra na outra, em ponto fixo.
// Requer: NONE, fluid_field, field_common, field_film, field_film_cells.

/** Primeira palavra da célula `slot` numa fatia do canal da película (a tabela começa na palavra 0). */
fn field_film_cell_word(slot: u32) -> u32 {
    return FIELD_FILM_WORDS * slot;
}

/** Célula `c` da película na fatia do quadro: o índice da que tem a chave, inserida se `insert` (ou `NONE`). */
fn field_film_find(c: vec3i, insert: bool) -> u32 {
    let key = field_film_key(c);
    if (key == 0u) { return NONE; }
    var slot = field_film_bucket(c);
    let step = (key << 1u) | 1u;
    for (var k = 0u; k < FIELD_FILM_PROBES; k++) {
        let w = field_film_cell_word(slot);
        let found = atomicLoad(&field_film_cells[w]);
        if (found == key) { return slot; }
        if (found == 0u) {
            if (!insert) { return NONE; }
            let old = atomicCompareExchangeWeak(&field_film_cells[w], 0u, key);
            if (old.exchanged || old.old_value == key) { return slot; }
            if (old.old_value == 0u) { continue; }
        }
        slot = (slot + step) & fluid_field.film.y;
    }
    return NONE;
}
