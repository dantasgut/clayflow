// Nó `set.compact` (spec 031), predicado da compactação estável: os índices dos elementos não nulos do conjunto u32,
// em ordem.
// Requer: set_u32_in.

fn compact_keep(i: u32) -> bool {
    return set_u32_in[i] != 0u;
}

fn compact_value(i: u32) -> u32 {
    return i;
}
