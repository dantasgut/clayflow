// Códigos de Morton das primitivas de uma hierarquia (spec 033, R1): o centro da caixa de cada primitiva normalizado na
// caixa do conjunto (`ray_bounds[build.slot]`) vira um código de 30 bits — a chave da ordenação radix — com o índice
// local como valor (deslocado de `build.keyShift` bits). Caixa vazia: chave máxima (vai para o fim, folha que nenhum
// raio atinge).
// Requer: WORKGROUP_SIZE, ray_common, build, ray_aabbs_read, ray_bounds_read, ray_keys, ray_values.

@compute @workgroup_size(WORKGROUP_SIZE)
fn ray_morton_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let i = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    if (i >= build.count) { return; }
    let lo = ray_aabbs[i * 2u].xyz;
    let hi = ray_aabbs[i * 2u + 1u].xyz;
    ray_values[i] = i;
    // Chave de `32 − keyShift` bits (a hierarquia de cima usa menos bits: menos passadas da ordenação).
    if (lo.x > hi.x) {
        ray_keys[i] = NONE >> build.keyShift;
        return;
    }
    let base = build.slot * 8u;
    let scene_lo = vec3f(ray_unorder_f32(~ray_bounds[base]), ray_unorder_f32(~ray_bounds[base + 1u]),
        ray_unorder_f32(~ray_bounds[base + 2u]));
    let scene_hi = vec3f(ray_unorder_f32(ray_bounds[base + 4u]), ray_unorder_f32(ray_bounds[base + 5u]),
        ray_unorder_f32(ray_bounds[base + 6u]));
    let extent = max(scene_hi - scene_lo, vec3f(1e-30));
    ray_keys[i] = ray_morton(((lo + hi) * 0.5 - scene_lo) / extent) >> build.keyShift;
}
