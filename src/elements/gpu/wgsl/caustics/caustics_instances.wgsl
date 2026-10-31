// As instâncias que fazem cáustica (spec 034, T067c; na onda dos acertos, spec 039): uma invocação por instância grava
// na onda o acerto sintético do centro dela (`caustics_instances_main`: o ponto, a normal para cima, o uv no meio, o tempo
// simulado, as constantes do `StandardMaterial` e a função `material` dela); o material é avaliado fora, por classe
// (`RayWave`); `caustics_instances_flag_main` lê o fechamento e grava 1 em `caustics_instance_capable` se a instância faz
// cáustica (`caustics_capable`), 0 se não (as instâncias além da contagem, os volumes). Sem laço.
// Requer: WORKGROUP_SIZE, NONE, caustics, caustics_capable, caustics_instance_capable, ray_scene, ray_wave.

@compute @workgroup_size(WORKGROUP_SIZE)
fn caustics_instances_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let k = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    if (k >= arrayLength(&caustics_instance_capable)) { return; }
    if (k >= ray_scene_info.instanceCount) { ray_wave_put_empty(k, vec4f(0.0)); return; }
    let inst = ray_instance_at(ray_scene_info.instanceFirst + k * RAY_INSTANCE_WORDS);
    if (inst.ids.z == RAY_KIND_VOLUME) { ray_wave_put_empty(k, vec4f(0.0)); return; }
    let root = ray_node(ray_blas_a(ray_scene_info.blasFirst + inst.ids.x * RAY_BLAS_WORDS).x, 0u);
    let center = (inst.toWorld * vec4f(0.5 * (root.lo + root.hi), 1.0)).xyz;
    let m = StandardMaterial(vec4f(inst.material0.rgb, 1.0), inst.material0.w, bitcast<f32>(inst.material1.x), 0.0, 0.0);
    ray_wave_put_surface(k, inst.ids.w & 0xFFFFu, inst.material1.y, center, vec3f(0.0, 1.0, 0.0), vec2f(0.5),
        caustics.extra.y, 0.0, 0.0, m, vec4f(0.0));
}

@compute @workgroup_size(WORKGROUP_SIZE)
fn caustics_instances_flag_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let k = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    if (k >= arrayLength(&caustics_instance_capable)) { return; }
    let capable = ray_wave_entries[k].hit.cls != NONE && caustics_capable(ray_wave_entries[k].closure);
    caustics_instance_capable[k] = select(0u, 1u, capable);
}
