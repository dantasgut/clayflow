// A separação da onda por classe (spec 039, R3): depois do traçado de uma rodada, `ray_wave_scan_main` (uma invocação)
// soma as contagens das classes em faixas na ordem (`ray_wave_ranges`: início e tamanho de cada classe) e zera os
// cursores; `ray_wave_scatter_main` põe o índice de cada registro na faixa da sua classe (a ordem dentro da classe não
// importa: cada kernel de material grava no índice do próprio registro); e `ray_wave_reset_main` zera as contagens antes
// da rodada. Despachos diretos de um número fixo de grupos que percorrem o trabalho em passo de grade (o indireto custa
// ~10× no Chrome: a validação dos argumentos; o direto do tamanho da capacidade paga os grupos vazios em toda rodada).
// Requer: WORKGROUP_SIZE, RayWaveHit, RayWaveEntry, ray_wave_entries_in, ray_wave_counts, ray_wave_ranges,
// ray_wave_ranges_out, ray_wave_order_out.

/** Classes da onda (as faixas). */
fn ray_wave_classes() -> u32 {
    return arrayLength(&ray_wave_ranges_out);
}

@compute @workgroup_size(WORKGROUP_SIZE)
fn ray_wave_reset_main(@builtin(global_invocation_id) gid: vec3u) {
    let n = arrayLength(&ray_wave_counts);
    if (gid.x >= n) { return; }
    atomicStore(&ray_wave_counts[gid.x], 0u);
}

@compute @workgroup_size(1)
fn ray_wave_scan_main() {
    let classes = ray_wave_classes();
    var start = 0u;
    for (var k = 0u; k < classes; k++) {
        let count = atomicLoad(&ray_wave_counts[1u + k]);
        ray_wave_ranges_out[k] = vec2u(start, count);
        atomicStore(&ray_wave_counts[1u + classes + k], 0u);
        start += count;
    }
}

@compute @workgroup_size(WORKGROUP_SIZE)
fn ray_wave_scatter_main(@builtin(global_invocation_id) gid: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let n = min(atomicLoad(&ray_wave_counts[0]), arrayLength(&ray_wave_entries_in));
    let classes = arrayLength(&ray_wave_ranges);
    // Passo de grade: os grupos do despacho percorrem os registros da rodada.
    for (var i = gid.x; i < n; i += nwg.x * WORKGROUP_SIZE) {
        let cls = ray_wave_entries_in[i].hit.cls;
        if (cls >= classes) { continue; }
        let k = atomicAdd(&ray_wave_counts[1u + classes + cls], 1u);
        let range = ray_wave_ranges[cls];
        if (k >= range.y) { continue; }
        ray_wave_order_out[range.x + k] = i;
    }
}
