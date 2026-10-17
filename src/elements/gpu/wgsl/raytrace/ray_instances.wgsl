// Instâncias da cena para a hierarquia de cima (spec 033, R1; A5): por instância, a matriz de mundo lida do pool
// `WorldTransform` pelo slot do registro (identidade para as esferas, já em mundo), a inversa, e a caixa de mundo da
// hierarquia de baixo (os oito cantos da caixa da raiz dela) — guardada em `ray_aabbs` e acumulada na caixa do conjunto
// para os códigos de Morton da TLAS, como as primitivas das hierarquias de baixo.
// Requer: WORKGROUP_SIZE, ray_common, ray_reduce, build, ray_instance_sources, worlds, ray_blas_read, ray_nodes_read,
// ray_instances_out, ray_aabbs.

@compute @workgroup_size(WORKGROUP_SIZE)
fn ray_instances_main(
    @builtin(global_invocation_id) gid3: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
    @builtin(local_invocation_index) lid: u32,
) {
    let i = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    var box = array<vec3f, 2>(vec3f(RAY_MISS), vec3f(-RAY_MISS));
    if (i < build.count) { box = ray_instance_update(i); }
    ray_reduce_bounds(lid, box[0], box[1]);
}

/** Matrizes e caixa de mundo da instância `i` (guardada em `ray_aabbs`). */
fn ray_instance_update(i: u32) -> array<vec3f, 2> {
    let src = ray_instance_sources[i].ids;
    var world = mat4x4f(vec4f(1.0, 0.0, 0.0, 0.0), vec4f(0.0, 1.0, 0.0, 0.0), vec4f(0.0, 0.0, 1.0, 0.0),
        vec4f(0.0, 0.0, 0.0, 1.0));
    if (src.z != NONE) { world = worlds[src.z].world; }
    // `build.first`: início da faixa de hierarquias de baixo no pool.
    let blas = ray_blas[build.first + src.x].a;
    let root = ray_nodes[build.nodeFirst + blas.x];
    var lo = vec3f(RAY_MISS);
    var hi = vec3f(-RAY_MISS);
    if (root.lo.x <= root.hi.x) {
        for (var k = 0u; k < 8u; k++) {
            let corner = vec3f(
                select(root.lo.x, root.hi.x, (k & 1u) != 0u),
                select(root.lo.y, root.hi.y, (k & 2u) != 0u),
                select(root.lo.z, root.hi.z, (k & 4u) != 0u),
            );
            let p = (world * vec4f(corner, 1.0)).xyz;
            lo = min(lo, p);
            hi = max(hi, p);
        }
    }
    ray_instances_out[build.primFirst + i] = RayInstance(ray_inverse_affine(world), world, vec4u(src.x, src.y, src.w, 0u));
    ray_aabbs[i * 2u] = vec4f(lo, 0.0);
    ray_aabbs[i * 2u + 1u] = vec4f(hi, 0.0);
    return array<vec3f, 2>(lo, hi);
}
