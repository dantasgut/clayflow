// Nó `set.distributeOnMesh` (spec 031): candidatos = triângulos · K, do registro `SetCount` dos triângulos para o
// registro próprio do nó que a compactação lê (contagem da GPU, sem leitura de volta).
// Requer: distribute, set_counts (leitura e escrita), distribute_records.

@compute @workgroup_size(1)
fn distribute_candidates_main() {
    let triangles = min(set_counts[distribute.triangles_slot].count, distribute.triangle_capacity);
    distribute_records[0].count = triangles * distribute.per_triangle;
}
