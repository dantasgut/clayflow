// Caixas das primitivas de uma hierarquia em construção (spec 033, R1): por primitiva (triângulo ou esfera), a caixa em
// espaço de objeto no temporário `ray_aabbs` (duas `vec4f` por primitiva, mínimo e máximo) e a caixa do conjunto
// (reduzida no grupo, `ray_reduce_bounds`) — a base do código de Morton. Triângulo vazio ou partícula morta: caixa vazia
// (mínimo > máximo), que nenhum raio atinge.
// Requer: WORKGROUP_SIZE, ray_common, ray_prim_box, ray_reduce, build, ray_aabbs.

@compute @workgroup_size(WORKGROUP_SIZE)
fn ray_bounds_triangles_main(
    @builtin(global_invocation_id) gid3: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
    @builtin(local_invocation_index) lid: u32,
) {
    let i = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    var box = array<vec3f, 2>(ray_empty_lo(), ray_empty_hi());
    if (i < build.count) {
        box = ray_triangle_box(i);
        ray_aabbs[i * 2u] = vec4f(box[0], 0.0);
        ray_aabbs[i * 2u + 1u] = vec4f(box[1], 0.0);
    }
    ray_reduce_bounds(lid, box[0], box[1]);
}

@compute @workgroup_size(WORKGROUP_SIZE)
fn ray_bounds_spheres_main(
    @builtin(global_invocation_id) gid3: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
    @builtin(local_invocation_index) lid: u32,
) {
    let i = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    var box = array<vec3f, 2>(ray_empty_lo(), ray_empty_hi());
    if (i < build.count) {
        box = ray_sphere_box(i);
        ray_aabbs[i * 2u] = vec4f(box[0], 0.0);
        ray_aabbs[i * 2u + 1u] = vec4f(box[1], 0.0);
    }
    ray_reduce_bounds(lid, box[0], box[1]);
}
