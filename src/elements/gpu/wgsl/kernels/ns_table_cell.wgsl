// A célula da tabela da busca de vizinhança (spec 034): a grade cobre o domínio inteiro e a tabela das células se repete
// nele — a coordenada `q` da grade do domínio cai na célula `q mod table` (domínio do tamanho da tabela: a grade sem
// dobra). As partículas distantes que caem na mesma célula saem pela distância na busca.
// Requer: NONE.

/** A célula da tabela da coordenada `q` da grade do domínio, ou `NONE` fora do domínio. */
fn ns_table_cell(q: vec3i, domain: vec3u, table: vec3u) -> u32 {
    if (any(q < vec3i(0)) || any(vec3u(q) >= domain)) { return NONE; }
    let t = vec3u(q) % table;
    return t.x + t.y * table.x + t.z * table.x * table.y;
}
