// As listas do quadro entre as partículas e a película (spec 034, T066d), em `field_drips` (palavras u32), na ordem que
// não depende da dos atômicos (o estado das partículas sai igual bit a bit):
// - as retiradas, em `FIELD_FILM_DRIPS` baldes: o balde `item % FIELD_FILM_DRIPS` guarda a de menor índice no array
//   compacto da junção (`~item` pelo máximo atômico; 0 vazio);
// - as gotas que deslizam, passadas à película, nos mesmos baldes (a de menor índice de cada um; as outras esperam o
//   quadro seguinte);
// - os pedidos de pingo da película (a chave e a palavra da célula, a posição), `FIELD_FILM_DRIPS` no máximo: o de
//   ordem `r` pela chave volta na retirada do `r`-ésimo balde ocupado;
// - o contato de cada gota dos baldes passada à película (o ponto e a normal snorm 8 × 4; `field_absorb_prepare_main`).
// Requer: FIELD_FILM_DRIPS.

/** A palavra do balde `k` das retiradas. */
fn field_retired_word(k: u32) -> u32 {
    return k;
}

/** A palavra do balde `k` das gotas passadas à película. */
fn field_absorb_word(k: u32) -> u32 {
    return FIELD_FILM_DRIPS + k;
}

/** A palavra da contagem dos pedidos de pingo. */
fn field_drip_count_word() -> u32 {
    return 2u * FIELD_FILM_DRIPS;
}

/** Primeira palavra do pedido de pingo `k` (a chave da célula, a palavra dela na fatia do quadro, a posição). */
fn field_drip_word(k: u32) -> u32 {
    return 2u * FIELD_FILM_DRIPS + 1u + 5u * k;
}

/** O índice no array compacto guardado num balde (`NONE` vazio). */
fn field_drop_item(stored: u32) -> u32 {
    return select(~stored, NONE, stored == 0u);
}

/** Primeira palavra do contato da gota do balde `k` passada à película (o ponto, a normal). */
fn field_absorb_contact_word(k: u32) -> u32 {
    return 7u * FIELD_FILM_DRIPS + 1u + 4u * k;
}
