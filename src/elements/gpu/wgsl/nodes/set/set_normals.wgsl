// Nó `set.recomputeNormals` (spec 031): a normal de cada vértice é a média das normais unitárias das faces adjacentes.
// Determinística: cada triângulo soma a sua normal nos três vértices em ponto fixo (`atomicAdd` de inteiros é
// associativo — a ordem das invocações não muda o resultado), e um segundo passe normaliza. Vértice sem face (ou só
// com faces degeneradas) mantém a normal de entrada. Posições, uv e triângulos seguem iguais.
// Requer: set_common, set_count, fixed_point, normals, mesh_vertices_in, mesh_triangles_in, mesh_vertices_out,
// normals_accum.

// Escala do ponto fixo: resolução ~1e-6 por componente, faixa ±2048 (somas de normais unitárias).
const NORMALS_FIXED_SCALE: f32 = 1048576.0;

fn normals_position(k: u32) -> vec3f {
    let m = mesh_vertices_in[k];
    return vec3f(m.px, m.py, m.pz);
}

fn normals_add(k: u32, n: vec3f) {
    atomicAdd(&normals_accum[3u * k], fixed_from_f32(n.x, NORMALS_FIXED_SCALE));
    atomicAdd(&normals_accum[3u * k + 1u], fixed_from_f32(n.y, NORMALS_FIXED_SCALE));
    atomicAdd(&normals_accum[3u * k + 2u], fixed_from_f32(n.z, NORMALS_FIXED_SCALE));
}

// Passo 1 (um por triângulo): normal unitária da face, (b − a) × (c − a), somada nos três vértices.
@compute @workgroup_size(SCAN_GROUP)
fn normals_accumulate_main(@builtin(global_invocation_id) gid: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let t = set_invocation(gid, nwg);
    if (t >= set_count_level(normals.triangles_slot, 0u)) { return; }
    let tri = mesh_triangles_in[t];
    if (max(tri.a, max(tri.b, tri.c)) >= set_count_level(normals.vertices_slot, 0u)) { return; }
    let pa = normals_position(tri.a);
    let f = cross(normals_position(tri.b) - pa, normals_position(tri.c) - pa);
    let len = length(f);
    if (!(len > 0.0)) { return; }
    let n = f / len;
    normals_add(tri.a, n);
    normals_add(tri.b, n);
    normals_add(tri.c, n);
}

// Passo 2 (um por vértice): a soma normalizada.
@compute @workgroup_size(SCAN_GROUP)
fn normals_write_main(@builtin(global_invocation_id) gid: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let i = set_invocation(gid, nwg);
    if (i >= set_count_level(normals.vertices_slot, 0u)) { return; }
    let m = mesh_vertices_in[i];
    let s = vec3f(
        fixed_to_f32(atomicLoad(&normals_accum[3u * i]), NORMALS_FIXED_SCALE),
        fixed_to_f32(atomicLoad(&normals_accum[3u * i + 1u]), NORMALS_FIXED_SCALE),
        fixed_to_f32(atomicLoad(&normals_accum[3u * i + 2u]), NORMALS_FIXED_SCALE),
    );
    let len = length(s);
    var n = vec3f(m.nx, m.ny, m.nz);
    if (len > 0.0) { n = s / len; }
    mesh_vertices_out[i] = MeshVertex(m.px, m.py, m.pz, n.x, n.y, n.z, m.u, m.v);
}
