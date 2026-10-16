// Elementos de entrada da compactação (Compaction, ponto `compact_count`), variante da GPU (spec 031): lidos do
// registro `SetCount` `compact.count_index`.

fn compact_count() -> u32 {
    return set_count_level(compact.count_index, 0u);
}
