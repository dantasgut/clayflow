// A fatia do quadro anterior do canal da película (`field_film.wgsl`, spec 034; constituição VII): a busca de uma
// célula nela, só leitura — o passo, a pressão e a gota passada à película leem dali (a escolha não depende da ordem
// das escritas do quadro).
// Requer: NONE, fluid_field, field_common, field_film, field_film_previous.

/** A página de chave `key` na fatia do quadro anterior do canal da película (`field_film_previous`), ou `NONE`. */
fn field_film_previous_page(key: u32) -> u32 {
    let base = field_film_pages_word();
    let mask = field_film_page_mask();
    var page = field_film_page_bucket(key);
    let step = (key << 1u) | 1u;
    for (var k = 0u; k < FIELD_FILM_PROBES; k++) {
        let found = field_film_previous[base + page];
        if (found == key) { return page; }
        if (found == 0u) { return NONE; }
        page = (page + step) & mask;
    }
    return NONE;
}

/**
 * A palavra da célula `c` (no plano dos eixos `axes`) na fatia do quadro anterior do canal da película
 * (`field_film_previous`), ou `NONE`.
 */
fn field_film_previous_word(c: vec3i, axes: vec2i) -> u32 {
    let key = field_film_key(c);
    if (key == 0u) { return NONE; }
    let page = field_film_previous_page(field_film_page_key(c, axes));
    if (page == NONE) { return NONE; }
    let w = FIELD_FILM_WORDS * field_film_slot_in(page, c, axes);
    return select(NONE, w, field_film_previous[w] == key);
}

/** Os eixos do plano da célula `slot` da fatia anterior (os da página dela). */
fn field_film_previous_axes(slot: u32) -> vec2i {
    return field_film_key_axes(field_film_previous[field_film_pages_word() + slot / 64u]);
}

