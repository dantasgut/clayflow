// Comum às passadas do filtro de sinal traçado (spec 034, R3, T044a): o pixel da invocação, uma por pixel do sinal
// (`traced_denoise_source_size`), e se ele existe.
// Requer: WORKGROUP_SIZE, traced_denoise_source.

/** O pixel da invocação (índice linear no sinal) e, em z, 1 se ele existe. */
fn traced_denoise_pixel(gid3: vec3u, nwg: vec3u) -> vec3u {
    let size = traced_denoise_source_size();
    let i = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    return vec3u(i % size.x, i / size.x, select(0u, 1u, i < size.x * size.y));
}

/** O pixel `q` (em pixels inteiros, talvez fora) existe e tem sinal? */
fn traced_denoise_inside(q: vec2i) -> bool {
    let size = vec2i(traced_denoise_source_size());
    return all(q >= vec2i(0)) && all(q < size) && traced_denoise_source_valid(vec2u(q));
}
