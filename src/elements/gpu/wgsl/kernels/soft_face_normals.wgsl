// Normais de face da superfície de um corpo mole (spec 008, R5): por triângulo, o produto vetorial das arestas
// (ponderado pela área), com as posições lidas da faixa do corpo no pool de partículas — um passo por quadro, antes da
// escrita dos vértices.

fn face_vertex(vertex: u32) -> vec3f {
    return particles[(surface.first + vertex) * surface.strideVec4 + surface.posOffsetVec4].xyz;
}

@compute @workgroup_size(WORKGROUP_SIZE)
fn soft_face_normals_main(
    @builtin(global_invocation_id) gid3: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
) {
    let t = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    if (t >= surface.triangleCount) { return; }
    let a = face_vertex(indices[t * 3u]);
    let b = face_vertex(indices[t * 3u + 1u]);
    let c = face_vertex(indices[t * 3u + 2u]);
    face_normals[t] = vec4f(cross(b - a, c - a), 0.0);
}
