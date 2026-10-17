// Cópia da geometria para a estrutura de raios (spec 033, R1; A1, A4, A9): os vértices (posição, normal, uv) de uma
// geometria e os triângulos (índices relativos à região de vértices) para as regiões da hierarquia no pool
// `RayGeometry` — todos os objetos num buffer único, que a consulta liga uma vez só. Índices `uint16` são lidos
// aos pares; com a contagem só na GPU (malha adaptativa, grafos), os triângulos além de `indirect[0] / 3` ficam vazios.
// Também copia as partículas de um corpo de sprites como esferas.
// Requer: WORKGROUP_SIZE, ray_common, build, src_vertices, src_indices, src_indirect, src_particles, ray_geometry_out.

fn ray_gather_index(gid3: vec3u, nwg: vec3u) -> u32 {
    return gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
}

@compute @workgroup_size(WORKGROUP_SIZE)
fn ray_gather_vertices_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let i = ray_gather_index(gid3, nwg);
    if (i >= build.vertexCount) { return; }
    let v = src_vertices[i];
    let w = build.vertexFirst + (build.vertexBase + i) * RAY_VERTEX_WORDS;
    ray_geometry_out[w] = RayGeometry(bitcast<vec4u>(vec4f(v.px, v.py, v.pz, v.u)));
    ray_geometry_out[w + 1u] = RayGeometry(bitcast<vec4u>(vec4f(v.nx, v.ny, v.nz, v.v)));
}

fn ray_write_triangle(t: u32, a: u32, b: u32, c: u32) {
    ray_geometry_out[build.primFirst + (build.primBase + t) * RAY_TRIANGLE_WORDS] =
        RayGeometry(vec4u(build.vertexBase + a, build.vertexBase + b, build.vertexBase + c, 0u));
}

fn ray_empty_triangle(t: u32) {
    ray_geometry_out[build.primFirst + (build.primBase + t) * RAY_TRIANGLE_WORDS] = RayGeometry(vec4u(NONE));
}

@compute @workgroup_size(WORKGROUP_SIZE)
fn ray_gather_triangles_u32_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let t = ray_gather_index(gid3, nwg);
    if (t >= build.count) { return; }
    ray_write_triangle(t, src_indices[t * 3u], src_indices[t * 3u + 1u], src_indices[t * 3u + 2u]);
}

/** Índice `uint16` `k` do buffer (dois por palavra, o de menor endereço na metade baixa). */
fn ray_index_u16(k: u32) -> u32 {
    let word = src_indices[k >> 1u];
    return select(word & 0xFFFFu, word >> 16u, (k & 1u) == 1u);
}

@compute @workgroup_size(WORKGROUP_SIZE)
fn ray_gather_triangles_u16_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let t = ray_gather_index(gid3, nwg);
    if (t >= build.count) { return; }
    ray_write_triangle(t, ray_index_u16(t * 3u), ray_index_u16(t * 3u + 1u), ray_index_u16(t * 3u + 2u));
}

@compute @workgroup_size(WORKGROUP_SIZE)
fn ray_gather_triangles_indirect_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let t = ray_gather_index(gid3, nwg);
    if (t >= build.count) { return; }
    // Registro indireto indexado: o primeiro u32 é a contagem de índices desenhados.
    if (t >= src_indirect[0] / 3u) {
        ray_empty_triangle(t);
        return;
    }
    ray_write_triangle(t, src_indices[t * 3u], src_indices[t * 3u + 1u], src_indices[t * 3u + 2u]);
}

@compute @workgroup_size(WORKGROUP_SIZE)
fn ray_gather_spheres_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let i = ray_gather_index(gid3, nwg);
    if (i >= build.count) { return; }
    let p = src_particles[(build.first + i) * build.strideVec4 + build.posOffsetVec4].xyz;
    ray_geometry_out[build.primFirst + (build.primBase + i) * RAY_SPHERE_WORDS] =
        RayGeometry(bitcast<vec4u>(vec4f(p, build.radius)));
}
