// A transmitância dos volumes no trecho de cada raio da onda (spec 034, T060e): depois dos acertos, um kernel só para a
// marcha pelos volumes (a água do campo dos fluidos), com o trecho que o acerto gravou em `gi_wave_scatter` (a origem, a
// direção, o comprimento; 0 sem trecho). A marcha é longa (as quatro travessias, a secante, a tricúbica): embutida no
// kernel do acerto, ela fixava os registradores dele e os raios em voo caíam — no tanque, o traçado das sondas de tela
// custava 7 vezes o da estrutura de raios sozinha. Multiplica o que o acerto gravou na carga da onda (rgb).
// Requer: WORKGROUP_SIZE, gi, gi_common, RayWaveEntry, ray_wave_entries, ray_wave_counts, gi_wave_scatter_read,
// ray_volume_transmittance.

@compute @workgroup_size(WORKGROUP_SIZE)
fn gi_wave_through_main(@builtin(global_invocation_id) gid: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    // Os registros da rodada (o maior índice gravado + 1): todos os índices abaixo foram gravados por quem traçou.
    let n = atomicLoad(&ray_wave_counts[0]);
    // Passo de grade: os grupos do despacho percorrem os registros (até a capacidade da onda).
    for (var j = gid.x; j < n; j += nwg.x * WORKGROUP_SIZE) {
        let seg = gi_wave_scatter_read[2u * j + 1u].x;
        if (seg <= 0.0) { continue; }
        let trace = gi_wave_scatter_read[2u * j];
        let dir = gi_oct_decode(unpack2x16snorm(bitcast<u32>(trace.w)));
        let through = ray_volume_transmittance(trace.xyz, dir, seg, gi.extra.w);
        let payload = ray_wave_entries[j].hit.payload;
        ray_wave_entries[j].hit.payload = vec4f(payload.rgb * through, payload.w);
    }
}
