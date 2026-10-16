// Nó `set.meshOutput` (spec 031, R10): escreve a malha na `GraphGeometry` alvo — um triângulo da capacidade do alvo
// por invocação. Os triângulos além da contagem (ou com vértice além dos vértices copiados) ficam degenerados (0, 0, 0):
// sem `indirect-first-instance` o desenho é direto pela capacidade. Arestas de arame (a, b), (b, c), (c, a) por
// triângulo, zeradas além da contagem. A invocação 0 escreve o registro indireto: byte 0, desenho indexado de
// triângulos · 3 índices; byte 20, arame de arestas · 6 vértices.
// Requer: set_common, set_count, mesh_output, mesh_triangles_in, target_indices, target_edges, target_indirect.

@compute @workgroup_size(SCAN_GROUP)
fn mesh_output_main(@builtin(global_invocation_id) gid: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let i = set_invocation(gid, nwg);
    let vertices = min(set_count_level(mesh_output.vertices_slot, 0u), mesh_output.vertex_capacity);
    let triangles = min(set_count_level(mesh_output.triangles_slot, 0u), mesh_output.triangle_capacity);
    let edges = min(3u * triangles, mesh_output.edge_capacity);
    if (i == 0u) {
        target_indirect[0] = 3u * triangles;
        target_indirect[1] = 1u;
        target_indirect[2] = 0u;
        target_indirect[3] = 0u;
        target_indirect[4] = 0u;
        target_indirect[5] = 6u * edges;
        target_indirect[6] = 1u;
        target_indirect[7] = 0u;
        target_indirect[8] = 0u;
        target_indirect[9] = 0u;
    }
    var tri = vec3u(0u);
    if (i < triangles) {
        let t = mesh_triangles_in[i];
        if (max(t.a, max(t.b, t.c)) < vertices) { tri = vec3u(t.a, t.b, t.c); }
    }
    if (i < mesh_output.triangle_capacity) {
        target_indices[3u * i] = tri.x;
        target_indices[3u * i + 1u] = tri.y;
        target_indices[3u * i + 2u] = tri.z;
    }
    for (var k = 0u; k < 3u; k++) {
        let e = 3u * i + k;
        if (e >= mesh_output.edge_capacity) { break; }
        var pair = vec2u(0u);
        if (e < edges) { pair = vec2u(tri[k], tri[(k + 1u) % 3u]); }
        target_edges[2u * e] = pair.x;
        target_edges[2u * e + 1u] = pair.y;
    }
}
