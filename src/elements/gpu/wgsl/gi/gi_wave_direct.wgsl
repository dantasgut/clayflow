// A luz direta nos acertos da onda (spec 034, T078): depois do material avaliado por classe, a luz das fontes (raio de
// sombra pela estrutura de raios) mais a emissão em cada acerto da rodada e os fatores da luz rebatida do fechamento
// (`gi_shade_factors`), gravados no índice do raio — três vec4f: a luz direta (w: 1 com translúcido), os fatores da
// frente e do verso — para quem soma os rebatimentos (`gi_probe_trace_main`, `gi_screen_trace_main`), que não lê o
// fechamento. A luz direta é o que liga as luzes, a estrutura de raios e os contribuintes da luz (as cáusticas, a
// transmissão das sombras); os rebatimentos ligam só o que é deles — cada kernel cabe no que o adaptador concede por
// estágio. Uma rodada leva os raios das sondas do mundo e, depois deles, os das sondas de tela (`gi_wave_screen_first`),
// cada faixa com a sequência da luz dela.
// Requer: WORKGROUP_SIZE, NONE, gi, gi_common, gi_shade, random, RayWaveEntry, ray_wave_entries_in, ray_wave_counts,
// gi_wave_light.

@compute @workgroup_size(WORKGROUP_SIZE)
fn gi_wave_direct_main(@builtin(global_invocation_id) gid: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    // Os registros da rodada (o maior índice gravado + 1): todos os índices abaixo foram gravados por quem traçou.
    let n = atomicLoad(&ray_wave_counts[0]);
    let first = gi_wave_screen_first();
    // Passo de grade: os grupos do despacho percorrem os registros (até a capacidade da onda).
    for (var j = gid.x; j < n; j += nwg.x * WORKGROUP_SIZE) {
        let h = ray_wave_entries_in[j].hit;
        // Sem acerto (escape, face de trás, sonda fora da vez): nenhuma luz no ponto.
        if (h.cls == NONE || h.payload.w < 0.0) {
            gi_wave_light[3u * j] = vec4f(0.0);
            continue;
        }
        // A direção do raio na etiqueta do registro (octaédrica de 16 bits por eixo, gravada por quem traçou).
        let v = -gi_oct_decode(unpack2x16snorm(h.ray));
        let c = ray_wave_entries_in[j].closure;
        let screen = j >= first;
        let seed = select(random_seed(RANDOM_STREAM_GI_WORLD, j, gi.rays.y),
            random_seed(RANDOM_STREAM_GI_SCREEN_LIGHT, j - first, gi.rays.y), screen);
        let f = gi_shade_factors(c, h.normal, v);
        let direct = gi_shade_direct(c, h.position, h.normal, v, seed);
        gi_wave_light[3u * j] = vec4f(direct, select(0.0, 1.0, f.translucent));
        gi_wave_light[3u * j + 1u] = vec4f(f.front, 0.0);
        gi_wave_light[3u * j + 2u] = vec4f(f.back, 0.0);
    }
}
