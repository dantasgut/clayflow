// Triângulos na ordem das folhas (spec 033, R1): depois da ordenação por Morton, os triângulos da hierarquia vão para
// a ordem das folhas (por um temporário: primeiro a cópia permutada, depois a volta ao pool) — o reajuste e as consultas
// leem triângulos vizinhos de folhas vizinhas, e a folha j aponta o triângulo j.
// Requer: WORKGROUP_SIZE, ray_common, build, ray_values_read, ray_geometry_out, ray_tris.

fn ray_reorder_index(gid3: vec3u, nwg: vec3u) -> u32 {
    return gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
}

@compute @workgroup_size(WORKGROUP_SIZE)
fn ray_reorder_gather_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let j = ray_reorder_index(gid3, nwg);
    if (j >= build.count) { return; }
    ray_tris[j] = ray_geometry_out[build.primFirst + (build.primBase + ray_values[j]) * RAY_TRIANGLE_WORDS].word;
}

@compute @workgroup_size(WORKGROUP_SIZE)
fn ray_reorder_store_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let j = ray_reorder_index(gid3, nwg);
    if (j >= build.count) { return; }
    ray_geometry_out[build.primFirst + (build.primBase + j) * RAY_TRIANGLE_WORDS] = RayGeometry(ray_tris[j]);
}
