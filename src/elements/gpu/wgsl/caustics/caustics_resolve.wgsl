// Acúmulo das cáusticas (spec 034, T067c; antes da GI): por balde do hash, a soma do quadro (ponto fixo) vira
// irradiância — a potência por fóton (do cabeçalho) dividida pela área da célula do nível dela — e entra na acumulada por
// média móvel; as somas zeram.
// Uma célula sem fótons decai para 0. Com o hash mais que ¾ ocupado no quadro anterior, tudo recomeça (as células
// de luzes que se moveram não ficam ocupando baldes).
// Requer: WORKGROUP_SIZE, caustics, caustics_common, caustics_hash_atomic.

@compute @workgroup_size(WORKGROUP_SIZE)
fn caustics_resolve_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let slot = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    let n = caustics_slots();
    if (slot >= n) { return; }
    let w = caustics_word(slot);
    let key = atomicLoad(&caustics_hash_atomic[w]);
    if (key == CAUSTICS_EMPTY) { return; }
    let reset = atomicLoad(&caustics_hash_atomic[1]) * 4u > n * 3u;
    let power = bitcast<f32>(atomicLoad(&caustics_hash_atomic[0]));
    let cell = caustics_cell_size(slot / caustics_level_slots());
    let area = cell * cell;
    // As somas com sinal (a variável de controle dos fótons): complemento de dois.
    let sum = vec3f(bitcast<vec3i>(vec3u(
        atomicLoad(&caustics_hash_atomic[w + 1u]),
        atomicLoad(&caustics_hash_atomic[w + 2u]),
        atomicLoad(&caustics_hash_atomic[w + 3u]),
    ))) / CAUSTICS_ONE * power / area;
    let old = vec3f(
        bitcast<f32>(atomicLoad(&caustics_hash_atomic[w + 4u])),
        bitcast<f32>(atomicLoad(&caustics_hash_atomic[w + 5u])),
        bitcast<f32>(atomicLoad(&caustics_hash_atomic[w + 6u])),
    );
    var irradiance = mix(sum, old, CAUSTICS_HYSTERESIS);
    if (reset) {
        irradiance = vec3f(0.0);
        atomicStore(&caustics_hash_atomic[w], CAUSTICS_EMPTY);
    } else {
        atomicAdd(&caustics_hash_atomic[2], 1u);
    }
    atomicStore(&caustics_hash_atomic[w + 1u], 0u);
    atomicStore(&caustics_hash_atomic[w + 2u], 0u);
    atomicStore(&caustics_hash_atomic[w + 3u], 0u);
    atomicStore(&caustics_hash_atomic[w + 4u], bitcast<u32>(irradiance.r));
    atomicStore(&caustics_hash_atomic[w + 5u], bitcast<u32>(irradiance.g));
    atomicStore(&caustics_hash_atomic[w + 6u], bitcast<u32>(irradiance.b));
}
