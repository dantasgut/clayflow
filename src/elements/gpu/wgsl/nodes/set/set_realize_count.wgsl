// Nó `set.realizeInstances` (spec 031): vértices = pontos · (segmentos + 1)(anéis + 1) e triângulos =
// pontos · 2 · segmentos · anéis, do registro `SetCount` dos pontos para os registros da malha de saída.
// Requer: realize, set_counts (leitura e escrita).

@compute @workgroup_size(1)
fn realize_count_main() {
    let n = set_counts[realize.points_slot].count;
    let per_vertex = (realize.segments + 1u) * (realize.rings + 1u);
    let per_triangle = 2u * realize.segments * realize.rings;
    set_counts[realize.vertices_slot].count = min(n * per_vertex, realize.vertex_capacity);
    set_counts[realize.triangles_slot].count = min(n * per_triangle, realize.triangle_capacity);
}
