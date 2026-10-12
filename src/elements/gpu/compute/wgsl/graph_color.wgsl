// Coloração de arestas na GPU (GraphColorer, research R12): definições comuns aos passes.

// Aresta ainda sem cor.
const GC_UNCOLORED: u32 = 0xFFFFFFFFu;

// Prioridade da aresta `e` no subpasso `step`: `pcg_hash` é uma bijeção de u32, então a prioridade é única por aresta
// em cada subpasso — no máximo uma aresta vence em cada vértice.
fn gc_edge_priority(e: u32, step: u32) -> u32 {
    return pcg_hash(e ^ pcg_hash(step));
}
