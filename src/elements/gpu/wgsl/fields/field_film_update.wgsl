// A tabela da película de água nos sólidos escrita com atômicos (`field_film.wgsl`, spec 034), na fatia do quadro do
// canal temporal (`field_film_cells`, T060f; constituição VII): a busca e a inserção de uma célula. A massa da película se
// conserva no escoamento: o que sai de uma célula entra na outra, em ponto fixo.
// Requer: NONE, fluid_field, field_common, field_film, field_film_cells.

/** Primeira palavra da célula `slot` numa fatia do canal da película (a tabela começa na palavra 0). */
fn field_film_cell_word(slot: u32) -> u32 {
    return FIELD_FILM_WORDS * slot;
}

/** A página `pc` da película na fatia do quadro: o índice dela, inserida se `insert` (ou `NONE`). */
fn field_film_page_find(pc: vec3i, insert: bool) -> u32 {
    let key = field_film_page_key(pc);
    let base = field_film_pages_word();
    let mask = field_film_page_mask();
    var page = field_film_page_bucket(pc);
    let step = (key << 1u) | 1u;
    for (var k = 0u; k < FIELD_FILM_PROBES; k++) {
        let found = atomicLoad(&field_film_cells[base + page]);
        if (found == key) { return page; }
        if (found == 0u) {
            if (!insert) { return NONE; }
            let old = atomicCompareExchangeWeak(&field_film_cells[base + page], 0u, key);
            if (old.exchanged || old.old_value == key) { return page; }
            if (old.old_value == 0u) { continue; }
        }
        page = (page + step) & mask;
    }
    return NONE;
}

/**
 * Célula `c` da película na fatia do quadro: o índice da que tem a chave, inserida se `insert` (ou `NONE`) — a página
 * pela tabela das páginas, a célula direto nela.
 */
fn field_film_find(c: vec3i, insert: bool) -> u32 {
    let key = field_film_key(c);
    if (key == 0u) { return NONE; }
    let page = field_film_page_find(field_film_page(c), insert);
    if (page == NONE) { return NONE; }
    let slot = field_film_slot_in(page, c);
    let w = field_film_cell_word(slot);
    // A chave da célula só é escrita na primeira vez (muitas partículas molham a mesma célula no quadro).
    if (atomicLoad(&field_film_cells[w]) == key) { return slot; }
    if (!insert) { return NONE; }
    atomicStore(&field_film_cells[w], key);
    return slot;
}
