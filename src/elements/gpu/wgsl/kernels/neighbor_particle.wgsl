// A partícula de um posto da ordem por célula (`NeighborSearchPipeline` com `byRank`): os kernels que leem vizinhos rodam
// nessa ordem — threads vizinhos tratam partículas vizinhas e leem os mesmos vizinhos (o cache da GPU os reaproveita) —
// e leem a lista e a contagem pelo posto.
// Requer: NONE, pool_live, neighbor_order, live.

/** A partícula do posto `t` (de `count` postos), ou `NONE`: posto vazio, ou a partícula não está viva. */
fn neighbor_particle(t: u32, count: u32) -> u32 {
    if (t >= count) { return NONE; }
    let ranked = neighbor_order[t];
    if (ranked == 0u) { return NONE; }
    let i = ranked - 1u;
    if (!pool_live(live[i >> 5u], i)) { return NONE; }
    return i;
}
