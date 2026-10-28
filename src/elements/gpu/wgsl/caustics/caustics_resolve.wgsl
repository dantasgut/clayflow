// Acúmulo das cáusticas (spec 034, T067c; antes da GI): por balde do hash, a soma do quadro (ponto fixo) vira
// irradiância — a potência por fóton (do cabeçalho) dividida pela área da célula do nível dela — e entra na acumulada por
// média móvel, com os fótons do quadro; as somas zeram. A invocação 0 guarda a fração da emissão na caixa dos volumes.
// Uma célula sem fótons decai para 0. Com o hash mais que ¾ ocupado no quadro anterior, tudo recomeça (as células
// de luzes que se moveram não ficam ocupando baldes).
// Requer: WORKGROUP_SIZE, caustics, caustics_common, caustics_hash_atomic.

@compute @workgroup_size(WORKGROUP_SIZE)
fn caustics_resolve_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let slot = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    if (slot == 0u) {
        // A fração das amostras na caixa dos volumes que passou pela água (a emissão do quadro seguinte).
        let tries = atomicLoad(&caustics_hash_atomic[CAUSTICS_TRIES]);
        if (tries > 0u) {
            let ratio = max(f32(atomicLoad(&caustics_hash_atomic[CAUSTICS_ACCEPTED])) / f32(tries), 1e-6);
            atomicStore(&caustics_hash_atomic[CAUSTICS_ACCEPTED_RATIO], bitcast<u32>(ratio));
        }
        atomicStore(&caustics_hash_atomic[CAUSTICS_TRIES], 0u);
        atomicStore(&caustics_hash_atomic[CAUSTICS_ACCEPTED], 0u);
    }
    let n = caustics_slots();
    if (slot >= n) { return; }
    let w = caustics_word(slot);
    let key = atomicLoad(&caustics_hash_atomic[w]);
    if (key == CAUSTICS_EMPTY) { return; }
    let reset = atomicLoad(&caustics_hash_atomic[1]) * 4u > n * 3u;
    let power = bitcast<f32>(atomicLoad(&caustics_hash_atomic[0]));
    let cell = caustics_cell_size(caustics_key_level(key));
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
    // Os fótons por quadro na mesma média móvel: quem lê escolhe o nível por eles.
    var photons = mix(f32(atomicLoad(&caustics_hash_atomic[w + 7u])) / CAUSTICS_ONE,
        bitcast<f32>(atomicLoad(&caustics_hash_atomic[w + 8u])), CAUSTICS_HYSTERESIS);
    if (reset) {
        irradiance = vec3f(0.0);
        photons = 0.0;
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
    atomicStore(&caustics_hash_atomic[w + 7u], 0u);
    atomicStore(&caustics_hash_atomic[w + 8u], bitcast<u32>(photons));
}
