// Contagem de um nível da redução (Reduce, ponto `reduce_count`), variante da GPU (spec 031): lida do registro
// `SetCount` `reduce_level.count_index` e reduzida até o nível `reduce_level.depth`.

fn reduce_count() -> u32 {
    return set_count_level(reduce_level.count_index, reduce_level.depth);
}
