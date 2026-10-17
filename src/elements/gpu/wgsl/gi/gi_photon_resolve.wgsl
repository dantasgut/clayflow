// Acúmulo das cáusticas (spec 033, US5; R5): por balde do hash, a soma do quadro (ponto fixo) vira irradiância — a
// potência por fóton (do cabeçalho) dividida pela área da célula — e entra na acumulada por média móvel; a soma zera.
// Uma célula sem fótons decai para 0. Com o hash mais que ¾ ocupado no quadro anterior, tudo recomeça (as células
// de luzes que se moveram não ficam ocupando baldes).
// Requer: WORKGROUP_SIZE, gi, gi_photon_common, gi_caustics_atomic.

const GI_PHOTON_HYSTERESIS: f32 = 0.9;

@compute @workgroup_size(WORKGROUP_SIZE)
fn gi_photon_resolve_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let slot = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    let n = gi_photon_slots();
    if (slot >= n) { return; }
    let w = gi_photon_word(slot);
    let key = atomicLoad(&gi_caustics_atomic[w]);
    if (key == GI_PHOTON_EMPTY) { return; }
    let reset = atomicLoad(&gi_caustics_atomic[1]) * 4u > n * 3u;
    let power = bitcast<f32>(atomicLoad(&gi_caustics_atomic[0]));
    let area = gi.extra.y * gi.extra.y;
    let sum = vec3f(
        f32(atomicLoad(&gi_caustics_atomic[w + 1u])),
        f32(atomicLoad(&gi_caustics_atomic[w + 2u])),
        f32(atomicLoad(&gi_caustics_atomic[w + 3u])),
    ) / GI_PHOTON_ONE * power / area;
    let old = vec3f(
        bitcast<f32>(atomicLoad(&gi_caustics_atomic[w + 4u])),
        bitcast<f32>(atomicLoad(&gi_caustics_atomic[w + 5u])),
        bitcast<f32>(atomicLoad(&gi_caustics_atomic[w + 6u])),
    );
    var irradiance = mix(sum, old, GI_PHOTON_HYSTERESIS);
    if (reset) {
        irradiance = vec3f(0.0);
        atomicStore(&gi_caustics_atomic[w], GI_PHOTON_EMPTY);
    } else {
        atomicAdd(&gi_caustics_atomic[2], 1u);
    }
    atomicStore(&gi_caustics_atomic[w + 1u], 0u);
    atomicStore(&gi_caustics_atomic[w + 2u], 0u);
    atomicStore(&gi_caustics_atomic[w + 3u], 0u);
    atomicStore(&gi_caustics_atomic[w + 4u], bitcast<u32>(irradiance.r));
    atomicStore(&gi_caustics_atomic[w + 5u], bitcast<u32>(irradiance.g));
    atomicStore(&gi_caustics_atomic[w + 6u], bitcast<u32>(irradiance.b));
}
