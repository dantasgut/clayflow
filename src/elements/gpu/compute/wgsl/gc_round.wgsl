// Coloração de arestas (GraphColorer), um subpasso da cor corrente `gc_status.color`: cada aresta sem cor e sem
// vértice já usado nesta cor é candidata; vence a de maior prioridade nos dois vértices (máximo atômico), recebe a
// cor e marca os vértices (`gc_used[v] = cor + 1`). Sem candidatas, a cor está completa (emparelhamento maximal) e o
// passe de avanço passa à próxima — por isso o número de cores fica ≤ 2Δ − 1.

// Aresta sem cor cujos vértices ainda não foram usados na cor corrente.
fn gc_is_candidate(e: u32, edge: vec2u, mark: u32) -> bool {
    return gc_colors[e] == GC_UNCOLORED
        && atomicLoad(&gc_used[edge.x]) != mark
        && atomicLoad(&gc_used[edge.y]) != mark;
}

@compute @workgroup_size(256)
fn gc_priority_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let e = gid3.x + gid3.y * nwg.x * 256u;
    if (e >= gc.edge_count || gc_colors[e] != GC_UNCOLORED) { return; }
    atomicAdd(&gc_status.uncolored, 1u);
    let edge = gc_edges[e];
    if (!gc_is_candidate(e, edge, gc_status.color + 1u)) { return; }
    atomicAdd(&gc_status.candidates, 1u);
    let p = gc_edge_priority(e, gc_status.step);
    atomicMax(&gc_vmax[edge.x], p);
    atomicMax(&gc_vmax[edge.y], p);
}

@compute @workgroup_size(256)
fn gc_assign_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let e = gid3.x + gid3.y * nwg.x * 256u;
    if (e >= gc.edge_count) { return; }
    let color = gc_status.color;
    let edge = gc_edges[e];
    // Uma vencedora escrevendo `gc_used` num vértice compartilhado já derrota a aresta pelo máximo naquele vértice.
    if (!gc_is_candidate(e, edge, color + 1u)) { return; }
    let p = gc_edge_priority(e, gc_status.step);
    if (atomicLoad(&gc_vmax[edge.x]) != p || atomicLoad(&gc_vmax[edge.y]) != p) { return; }
    gc_colors[e] = color;
    atomicStore(&gc_used[edge.x], color + 1u);
    atomicStore(&gc_used[edge.y], color + 1u);
    atomicMax(&gc_status.color_count, color + 1u);
}

@compute @workgroup_size(1)
fn gc_advance_main() {
    if (atomicLoad(&gc_status.candidates) == 0u) { gc_status.color += 1u; }
    gc_status.step += 1u;
}
