// Caixa da cena para a luz da sombra (spec 034, L6): a caixa de mundo de cada entidade com geometria (a caixa de objeto
// do grupo dela pelos 8 cantos na matriz de mundo), reduzida em `shadow_scene_bounds` por máximos atômicos de floats em
// ordem de inteiro (o mínimo pelo complemento): [0, 3) o mínimo, [3, 6) o máximo, 6 marca uma caixa desconhecida
// (vértices da GPU), 7 conta as caixas. O buffer começa zerado no quadro (zero = nada ainda). Um fio por instância; o
// grupo dela pela soma das contagens (os grupos são poucos: um por geometria).
// Requer: WORKGROUP_SIZE, worlds, shadow_bounds_list, shadow_bounds_groups, shadow_params, shadow_scene_bounds.

/** Float → inteiro na mesma ordem (o sinal invertido nos negativos). */
fn shadow_ordered(x: f32) -> u32 {
    let b = bitcast<u32>(x);
    return select(b | 0x80000000u, ~b, (b & 0x80000000u) != 0u);
}

@compute @workgroup_size(WORKGROUP_SIZE)
fn shadow_bounds_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let i = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    if (i >= shadow_params.sceneCount) { return; }
    var g = 0u;
    var start = 0u;
    for (; g + 1u < shadow_params.sceneGroups; g++) {
        let n = shadow_bounds_groups[g].count;
        if (i < start + n) { break; }
        start += n;
    }
    let b = shadow_bounds_groups[g];
    if (b.boundsMin.w > 0.5) {
        atomicMax(&shadow_scene_bounds[6], 1u);
        return;
    }
    let m = worlds[shadow_bounds_list[b.first + i - start].world].world;
    var lo = vec3f(3.4e38);
    var hi = vec3f(-3.4e38);
    for (var k = 0u; k < 8u; k++) {
        let c = select(b.boundsMin.xyz, b.boundsMax.xyz, vec3<bool>((k & 1u) != 0u, (k & 2u) != 0u, (k & 4u) != 0u));
        let w = (m * vec4f(c, 1.0)).xyz;
        lo = min(lo, w);
        hi = max(hi, w);
    }
    for (var a = 0u; a < 3u; a++) {
        atomicMax(&shadow_scene_bounds[a], ~shadow_ordered(lo[a]));
        atomicMax(&shadow_scene_bounds[3u + a], shadow_ordered(hi[a]));
    }
    atomicAdd(&shadow_scene_bounds[7], 1u);
}
