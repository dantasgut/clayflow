// Comum às passadas do filtro de sinal traçado (spec 034, R3, T044a): o pixel da invocação, uma por pixel do sinal
// (`temporal_filter_source_size`), e se ele existe.
// Requer: WORKGROUP_SIZE, temporal_filter_source.

/** O pixel da invocação (índice linear no sinal) e, em z, 1 se ele existe. */
fn temporal_filter_pixel(gid3: vec3u, nwg: vec3u) -> vec3u {
    let size = temporal_filter_source_size();
    let i = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    return vec3u(i % size.x, i / size.x, select(0u, 1u, i < size.x * size.y));
}

/** O pixel `q` (em pixels inteiros, talvez fora) existe e tem sinal? */
fn temporal_filter_inside(q: vec2i) -> bool {
    let size = vec2i(temporal_filter_source_size());
    return all(q >= vec2i(0)) && all(q < size) && temporal_filter_source_valid(vec2u(q));
}
