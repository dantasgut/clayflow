// Caixa de uma primitiva da hierarquia em construção (spec 033, R1): triângulo (dos vértices copiados) ou esfera, em
// espaço de objeto; vazia (mínimo > máximo) para o triângulo vazio e a partícula morta.
// Requer: ray_common, build, ray_vertices, ray_triangles, ray_spheres.

fn ray_empty_lo() -> vec3f { return vec3f(RAY_MISS); }
fn ray_empty_hi() -> vec3f { return vec3f(-RAY_MISS); }

/** Caixa do triângulo local `i` (vazia se o triângulo é vazio). */
fn ray_triangle_box(i: u32) -> array<vec3f, 2> {
    let tri = ray_triangles[build.primFirst + build.primBase + i].vertices;
    if (tri.x == NONE) { return array<vec3f, 2>(ray_empty_lo(), ray_empty_hi()); }
    let a = ray_vertices[build.vertexFirst + tri.x].position.xyz;
    let b = ray_vertices[build.vertexFirst + tri.y].position.xyz;
    let c = ray_vertices[build.vertexFirst + tri.z].position.xyz;
    return array<vec3f, 2>(min(a, min(b, c)), max(a, max(b, c)));
}

/** Caixa da esfera local `i` (vazia com raio nulo). */
fn ray_sphere_box(i: u32) -> array<vec3f, 2> {
    let s = ray_spheres[build.primFirst + build.primBase + i].sphere;
    if (s.w <= 0.0) { return array<vec3f, 2>(ray_empty_lo(), ray_empty_hi()); }
    return array<vec3f, 2>(s.xyz - vec3f(s.w), s.xyz + vec3f(s.w));
}

/** Caixa dos triângulos da folha que começa no triângulo local `first` (até `build.leafSize`, sem passar do fim). */
fn ray_leaf_triangles_box(first: u32) -> array<vec3f, 2> {
    var lo = ray_empty_lo();
    var hi = ray_empty_hi();
    let end = min(first + build.leafSize, build.count);
    for (var t = first; t < end; t++) {
        let b = ray_triangle_box(t);
        lo = min(lo, b[0]);
        hi = max(hi, b[1]);
    }
    return array<vec3f, 2>(lo, hi);
}
