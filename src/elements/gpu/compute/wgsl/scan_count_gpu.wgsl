// Contagem de um nível da soma de prefixos (PrefixSum, ponto `scan_count`), variante da GPU (spec 031): lida do
// registro `SetCount` `level.count_index` e reduzida até o nível `level.depth`.

fn scan_count() -> u32 {
    return set_count_level(level.count_index, level.depth);
}
