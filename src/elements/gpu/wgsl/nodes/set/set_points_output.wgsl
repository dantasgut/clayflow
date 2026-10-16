// Nó `set.pointsOutput` (spec 031): escreve os pontos como vértices da `GraphGeometry` alvo (posição, normal, uv 0),
// para o desenho por sprites (`PointSpriteMaterial`, um quad por vértice da capacidade). Os vértices além da contagem
// vão para fora do volume desenhável (|p| ≥ 1e30: o sprite os descarta); índices zerados e registro indireto vazio.
// Requer: set_common, set_count, points_output, set_points_in, target_vertices, target_indices, target_indirect.

// Posição dos vértices além da contagem: descartada pelo sprite de pontos.
const POINTS_OUTPUT_HIDDEN: f32 = 2e30;

@compute @workgroup_size(SCAN_GROUP)
fn points_output_main(@builtin(global_invocation_id) gid: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let i = set_invocation(gid, nwg);
    let points = min(set_count_level(points_output.points_slot, 0u), points_output.vertex_capacity);
    if (i == 0u) {
        for (var k = 0u; k < 10u; k++) { target_indirect[k] = select(0u, 1u, k == 1u || k == 6u); }
    }
    if (i < points_output.vertex_capacity) {
        var m = MeshVertex(POINTS_OUTPUT_HIDDEN, POINTS_OUTPUT_HIDDEN, POINTS_OUTPUT_HIDDEN, 0.0, 1.0, 0.0, 0.0, 0.0);
        if (i < points) {
            let p = set_points_in[i];
            m = MeshVertex(p.px, p.py, p.pz, p.nx, p.ny, p.nz, 0.0, 0.0);
        }
        target_vertices[i] = m;
    }
    if (i < points_output.index_capacity) { target_indices[i] = 0u; }
}
