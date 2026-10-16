// Vértices da superfície de um corpo mole (spec 008, R5): posição da partícula (faixa do corpo no pool) e normal média
// das faces adjacentes (adjacência CSR: `vertexCount + 1` inícios e os triângulos de cada vértice), escritas no vertex
// buffer da geometria (`array<MeshVertex>`; o uv fica como foi enviado). Sem atômicos: cada vértice
// soma as suas faces — determinístico.

@compute @workgroup_size(WORKGROUP_SIZE)
fn soft_vertex_write_main(
    @builtin(global_invocation_id) gid3: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
) {
    let v = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    if (v >= surface.vertexCount) { return; }
    let p = particles[(surface.first + v) * surface.strideVec4 + surface.posOffsetVec4].xyz;
    var n = vec3f(0.0);
    let begin = adjacency[v];
    let end = adjacency[v + 1u];
    let base = surface.vertexCount + 1u;
    for (var k = begin; k < end; k++) {
        n += face_normals[adjacency[base + k]].xyz;
    }
    let len = length(n);
    n = select(vec3f(0.0, 1.0, 0.0), n / len, len > 1e-12);
    let o = v;
    vertices[o].px = p.x;
    vertices[o].py = p.y;
    vertices[o].pz = p.z;
    vertices[o].nx = n.x;
    vertices[o].ny = n.y;
    vertices[o].nz = n.z;
}
