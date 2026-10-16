// Elementos ordenados (RadixSort, ponto `radix_count`), variante da GPU (spec 031): lidos do registro `SetCount`
// `radix.count_index`.

fn radix_count() -> u32 {
    return set_count_level(radix.count_index, 0u);
}
