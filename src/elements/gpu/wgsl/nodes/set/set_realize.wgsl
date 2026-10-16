// Nó `set.realizeInstances` (spec 031): uma esfera UV de raio `realize.radius` por ponto — (segmentos + 1)(anéis + 1)
// vértices, o anel r em θ = π·r/anéis e o segmento s em φ = 2π·s/segmentos, direção (sen θ cos φ, cos θ, sen θ sen φ)
// e uv (s/segmentos, r/anéis). Os senos e cossenos vêm da tabela `realize_table`, escrita pela CPU (anéis + 1 pares
// (sen θ, cos θ) e depois segmentos + 1 pares (cos φ, sen φ)): a mesma esfera da referência, sem a imprecisão do seno
// da GPU. Triângulos (a, b, c) e (b, d, c) por célula — anti-horários vistos de fora.
// Requer: set_common, set_count, realize, realize_table, set_points_in, mesh_vertices_out, mesh_triangles_out.

@compute @workgroup_size(SCAN_GROUP)
fn realize_vertices_main(@builtin(global_invocation_id) gid: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let i = set_invocation(gid, nwg);
    if (i >= set_count_level(realize.vertices_slot, 0u)) { return; }
    let columns = realize.segments + 1u;
    let per_vertex = columns * (realize.rings + 1u);
    let p = set_points_in[i / per_vertex];
    let j = i % per_vertex;
    let r = j / columns;
    let s = j % columns;
    let theta = realize_table[r];
    let phi = realize_table[realize.rings + 1u + s];
    let d = vec3f(theta.x * phi.x, theta.y, theta.x * phi.y);
    let q = vec3f(p.px, p.py, p.pz) + realize.radius * d;
    let uv = vec2f(f32(s) / f32(realize.segments), f32(r) / f32(realize.rings));
    mesh_vertices_out[i] = MeshVertex(q.x, q.y, q.z, d.x, d.y, d.z, uv.x, uv.y);
}

@compute @workgroup_size(SCAN_GROUP)
fn realize_triangles_main(@builtin(global_invocation_id) gid: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let i = set_invocation(gid, nwg);
    if (i >= set_count_level(realize.triangles_slot, 0u)) { return; }
    let columns = realize.segments + 1u;
    let per_vertex = columns * (realize.rings + 1u);
    let per_triangle = 2u * realize.segments * realize.rings;
    let q = i % per_triangle;
    let cell = q / 2u;
    let a = (i / per_triangle) * per_vertex + (cell / realize.segments) * columns + cell % realize.segments;
    let b = a + 1u;
    let c = a + columns;
    let d = c + 1u;
    if ((q & 1u) == 0u) {
        mesh_triangles_out[i] = MeshTriangle(a, b, c);
    } else {
        mesh_triangles_out[i] = MeshTriangle(b, d, c);
    }
}
