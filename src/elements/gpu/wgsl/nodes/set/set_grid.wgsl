// Nó `set.grid` (spec 031): grade nu × nv no plano y = 0, centrada na origem, com a orientação do plano pronto da
// `ParametricSurface` — o vértice (iu, iv) em (v, 0, u), u ao longo de z e v ao longo de x —, normal +y e uv
// (iu/(nu−1), iv/(nv−1)). Cada célula vira os triângulos (a, b, c) e (b, d, c), anti-horários vistos de +y.
// Uma invocação por vértice; as nu−1 × nv−1 primeiras também escrevem os dois triângulos da célula.
// Requer: set_common, grid, mesh_vertices_out, mesh_triangles_out.

@compute @workgroup_size(SCAN_GROUP)
fn grid_main(@builtin(global_invocation_id) gid: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let i = set_invocation(gid, nwg);
    let nu = grid.nu;
    let nv = grid.nv;
    if (i < nu * nv) {
        let su = f32(i % nu) / f32(nu - 1u);
        let sv = f32(i / nu) / f32(nv - 1u);
        let u = (su - 0.5) * grid.size_u;
        let v = (sv - 0.5) * grid.size_v;
        mesh_vertices_out[i] = MeshVertex(v, 0.0, u, 0.0, 1.0, 0.0, su, sv);
    }
    if (i < (nu - 1u) * (nv - 1u)) {
        let a = (i / (nu - 1u)) * nu + i % (nu - 1u);
        let b = a + 1u;
        let c = a + nu;
        let d = c + 1u;
        mesh_triangles_out[2u * i] = MeshTriangle(a, b, c);
        mesh_triangles_out[2u * i + 1u] = MeshTriangle(b, d, c);
    }
}
