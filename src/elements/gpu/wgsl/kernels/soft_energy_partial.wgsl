// Energia dos corpos moles, passada 1 (spec 037): um grupo por bloco `SoftBodyChunk` — só os dos corpos do algoritmo
// deste despacho (`soft_energy_params.counts.w`). Cada invocação soma a sua fatia estriada do bloco
// (`soft_energy_source_terms`: cinética, potencial e elástica dos elementos `chunk·SOFT_ENERGY_CHUNK + lane, + 64, …`,
// pela fonte do algoritmo trocada na montagem) e o grupo reduz em árvore, em ordem fixa — determinístico, sem atômicos
// de float. A invocação 0 grava a soma do bloco no slot dele (`soft_partials`).
// Requer: WORKGROUP_SIZE, soft_energy_params, soft_ranges, soft_chunks, soft_partials, soft_energy_source.

var<workgroup> soft_energy_partial: array<vec3f, WORKGROUP_SIZE>;
var<workgroup> soft_energy_owned: u32;

@compute @workgroup_size(WORKGROUP_SIZE)
fn soft_energy_partial_main(
    @builtin(workgroup_id) wid: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
    @builtin(local_invocation_index) lane: u32,
) {
    let c = wid.x + wid.y * nwg.x;
    if (lane == 0u) {
        var owned = 0u;
        if (c < soft_energy_params.counts.x) {
            owned = select(0u, 1u, soft_ranges[soft_chunks[c].range].algorithm == soft_energy_params.counts.w);
        }
        soft_energy_owned = owned;
    }
    // O grupo inteiro toma ou larga o bloco junto (as barreiras abaixo pedem fluxo uniforme).
    if (workgroupUniformLoad(&soft_energy_owned) == 0u) { return; }
    let chunk = soft_chunks[c];
    soft_energy_partial[lane] = soft_energy_source_terms(soft_ranges[chunk.range], chunk.chunk, lane);
    workgroupBarrier();
    for (var s = WORKGROUP_SIZE / 2u; s > 0u; s = s >> 1u) {
        if (lane < s) { soft_energy_partial[lane] += soft_energy_partial[lane + s]; }
        workgroupBarrier();
    }
    if (lane == 0u) {
        let t = soft_energy_partial[0];
        soft_partials[c] = SoftBodyPartial(t.x, t.y, t.z, 0.0);
    }
}
