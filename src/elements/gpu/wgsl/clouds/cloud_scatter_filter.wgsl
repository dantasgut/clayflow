// O cache de espalhamento filtrado (spec 041, T023, R8): a soma dos caminhos e a contagem de cada sonda com as vizinhas
// pelo filtro binomial 3 × 3 × 3 (1, 2, 1)³/64 — oito leituras trilineares deslocadas de ±½ texel por eixo dão
// exatamente esses pesos —, da fatia do quadro anterior (a última completa: os caminhos do quadro são despachados
// depois, sobrepostos à marcha), o que a marcha e o panorama leem. A soma e a contagem filtradas juntas mantêm a média
// com o peso das oitavas (`cloud_scatter_light`) e a sonda sem caminhos (contagem 0) fora dela. Com o sol que anda
// depressa (os vídeos do pôr do sol), as sondas ficam com 2–3 caminhos e o ruído de cada uma (um caminho tem desvio de
// 3 a 10 vezes a média no crepúsculo) aparecia na tela como estrias horizontais (a sonda é mais larga que alta); o filtro
// junta ~19 vezes os caminhos (1/Σw²) por sonda.
// Despacho linear: uma sonda por invocação.
// Requer: WORKGROUP_SIZE, cloud_scatter_grid, cloud_scatter_prev, cloud_clamp_sampler, cloud_scatter_filtered_out.

@compute @workgroup_size(WORKGROUP_SIZE)
fn cloud_scatter_filter_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let size = textureDimensions(cloud_scatter_filtered_out);
    let i = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    if (i >= size.x * size.y * size.z) { return; }
    let g = vec3u(i % size.x, (i / size.x) % size.y, i / (size.x * size.y));
    let inv = 1.0 / vec3f(size);
    let c = (vec3f(g) + 0.5) * inv;
    var s = vec4f(0.0);
    // Sem a fatia anterior válida (corte, a grade recentrada, a série que recomeça), as oitavas.
    if (!cloud_scatter_history_valid()) {
        textureStore(cloud_scatter_filtered_out, g, s);
        return;
    }
    for (var k = 0u; k < 8u; k++) {
        let o = vec3f(select(-0.5, 0.5, (k & 1u) != 0u), select(-0.5, 0.5, (k & 2u) != 0u), select(-0.5, 0.5, (k & 4u) != 0u));
        s += textureSampleLevel(cloud_scatter_prev, cloud_clamp_sampler, c + o * inv, 0.0);
    }
    textureStore(cloud_scatter_filtered_out, g, s * 0.125);
}
