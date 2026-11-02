// A luz direta nos acertos da onda (spec 034, T078): depois do material avaliado por classe, a luz das fontes (raio de
// sombra pela estrutura de raios) mais a emissão em cada acerto da rodada e os fatores da luz rebatida do fechamento
// (`gi_shade_factors`), gravados no índice do raio — quatro vec4f: a luz direta (w: 1 com translúcido), os fatores da
// frente e do verso e a luz das fontes espalhada pelos meios no trecho do raio (w: o albedo do meio; spec 034 T058,
// a amostra gravada pelo acerto em `gi_wave_scatter`) — para quem soma os rebatimentos (`gi_probe_trace_main`, `gi_screen_trace_main`), que não lê o
// fechamento. A luz direta é o que liga as luzes, a estrutura de raios e os contribuintes da luz (as cáusticas, a
// transmissão das sombras); os rebatimentos ligam só o que é deles — cada kernel cabe no que o adaptador concede por
// estágio. Uma rodada leva os raios das sondas do mundo e, depois deles, os das sondas de tela (`gi_wave_screen_first`),
// cada faixa com a sequência da luz dela.
// Requer: WORKGROUP_SIZE, NONE, gi, gi_common, gi_shade, random, RayWaveEntry, ray_wave_entries_in, ray_wave_counts,
// gi_wave_light, gi_wave_scatter_read, ray_volume_scatter.

/** Pontos do espalhamento por raio (um em cada fração igual do trecho, com o mesmo deslocamento sorteado). */
const GI_SCATTER_SAMPLES: u32 = 4u;

/** Fase de Henyey-Greenstein (cosseno entre a direção para a luz e a do raio, da origem para o meio). */
fn gi_scatter_phase(cos_theta: f32, g: f32) -> f32 {
    let d = 1.0 + g * g - 2.0 * g * cos_theta;
    return (1.0 - g * g) / (4.0 * PI * d * sqrt(max(d, 1e-8)));
}

/**
 * A luz das fontes que chega ao ponto `p` do meio e é espalhada para a origem do raio de direção `dir` (anisotropia
 * `g`): cada fonte com o raio de sombra pela estrutura de raios e o meio até ela; acima de `RAY_EXACT_LIGHTS` luzes, uma
 * sorteada (vezes a contagem, sem viés).
 */
fn gi_scatter_lights(p: vec3f, dir: vec3f, g: f32, seed: u32) -> vec3f {
    let count = min(min(gi.counts.x, arrayLength(&lights)), LIGHT_LIMIT);
    if (count == 0u) { return vec3f(0.0); }
    var first = 0u;
    var n = count;
    var scale = 1.0;
    if (count > RAY_EXACT_LIGHTS) {
        first = pcg_hash(seed ^ 0x5bd1e995u) % count;
        n = 1u;
        scale = f32(count);
    }
    var sum = vec3f(0.0);
    for (var k = 0u; k < n; k++) {
        let i = (first + k) % count;
        let inc = light_incoming(lights[i], p);
        if (all(inc.radiance <= vec3f(0.0))) { continue; }
        if (ray_scene_trace(p, inc.l, min(inc.dist, 1e6), true, NONE).instance != NONE) { continue; }
        sum += inc.radiance * light_transmission(i, p) * gi_scatter_phase(dot(inc.l, dir), g);
    }
    return sum * scale;
}

@compute @workgroup_size(WORKGROUP_SIZE)
fn gi_wave_direct_main(@builtin(global_invocation_id) gid: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    // Os registros da rodada (o maior índice gravado + 1): todos os índices abaixo foram gravados por quem traçou.
    let n = atomicLoad(&ray_wave_counts[0]);
    let first = gi_wave_screen_first();
    // Passo de grade: os grupos do despacho percorrem os registros (até a capacidade da onda).
    for (var j = gid.x; j < n; j += nwg.x * WORKGROUP_SIZE) {
        let h = ray_wave_entries_in[j].hit;
        let screen = j >= first;
        let seed = select(random_seed(RANDOM_STREAM_GI_WORLD, j, gi.rays.y),
            random_seed(RANDOM_STREAM_GI_SCREEN_LIGHT, j - first, gi.rays.y), screen);
        // A luz das fontes espalhada no trecho do raio pelos meios (todos os raios, também os que escapam).
        let trace = gi_wave_scatter_read[2u * j];
        let seg = gi_wave_scatter_read[2u * j + 1u].x;
        var scattered = vec4f(0.0);
        if (seg > 0.0) {
            let dir = gi_oct_decode(unpack2x16snorm(bitcast<u32>(trace.w)));
            let shift = f32(random_seed(RANDOM_STREAM_GI_SCATTER, j, gi.rays.y) & 0xFFFFFFu) / 16777216.0;
            // O albedo do meio no trecho: a média das amostras pelo peso do espalhamento delas.
            var albedo = 0.0;
            var mass = 0.0;
            for (var k = 0u; k < GI_SCATTER_SAMPLES; k++) {
                let sc = ray_volume_scatter(trace.xyz, dir, seg, (f32(k) + shift) / f32(GI_SCATTER_SAMPLES));
                let m = sc.weight.r + sc.weight.g + sc.weight.b;
                if (m <= 0.0) { continue; }
                scattered += vec4f(sc.weight * gi_scatter_lights(sc.position, dir, sc.anisotropy, seed + k), 0.0);
                albedo += sc.albedo * m;
                mass += m;
            }
            scattered = vec4f(scattered.rgb / f32(GI_SCATTER_SAMPLES), select(0.0, albedo / mass, mass > 0.0));
        }
        gi_wave_light[4u * j + 3u] = scattered;
        // Sem acerto (escape, face de trás, sonda fora da vez): nenhuma luz no ponto.
        if (h.cls == NONE || h.payload.w < 0.0) {
            gi_wave_light[4u * j] = vec4f(0.0);
            continue;
        }
        // A direção do raio na etiqueta do registro (octaédrica de 16 bits por eixo, gravada por quem traçou).
        let v = -gi_oct_decode(unpack2x16snorm(h.ray));
        let c = ray_wave_entries_in[j].closure;
        let f = gi_shade_factors(c, h.normal, v);
        let direct = gi_shade_direct(c, h.position, h.normal, v, seed);
        gi_wave_light[4u * j] = vec4f(direct, select(0.0, 1.0, f.translucent));
        gi_wave_light[4u * j + 1u] = vec4f(f.front, 0.0);
        gi_wave_light[4u * j + 2u] = vec4f(f.back, 0.0);
    }
}
