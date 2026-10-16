// Nó `set.displace` (spec 031): cada vértice anda ao longo da própria normal `scale · displace_height(p, n, uv)` — a
// entrada de ponto `height`, fundida no kernel. Normais e uv seguem iguais (recalcule com `set.recomputeNormals`).
// Contagem do registro `SetCount` dos vértices (da CPU ou da GPU), despacho indireto pelo mesmo registro.
// Requer: set_common, set_count, displace_height (pronto ou grafo), displace, mesh_vertices_in, mesh_vertices_out.

@compute @workgroup_size(SCAN_GROUP)
fn displace_main(@builtin(global_invocation_id) gid: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let i = set_invocation(gid, nwg);
    if (i >= set_count_level(displace.vertices_slot, 0u)) { return; }
    let m = mesh_vertices_in[i];
    let p = vec3f(m.px, m.py, m.pz);
    let n = vec3f(m.nx, m.ny, m.nz);
    let q = p + n * (displace.scale * displace_height(p, n, vec2f(m.u, m.v)));
    mesh_vertices_out[i] = MeshVertex(q.x, q.y, q.z, m.nx, m.ny, m.nz, m.u, m.v);
}
