// O resto da profundidade ótica até o sol depois do cone curto da luz (spec 041, R11; T074): de `q` (o fim do cone), o
// pedaço do trecho do mapa visto do sol até o nó do lado do sol, integrado em `CLOUD_SHADOW_PARTIAL_STEPS` passos, e o
// nó, lido do mapa (a integral da coluna da entrada da casca até ele). O que a marcha soma ao cone em cada amostra e
// o que o volume de τ até o sol guarda no segundo canal de cada nó. Espelho do resto de `cloud_sun_depth` (`cloudModel.ts`,
// `shadowDepthMarched`).
// Requer: cloud_density, cloud_shadow_lookup, sky, clouds.

/** Passos do pedaço do trecho do mapa visto do sol entre o fim do cone e o nó do lado do sol. */
const CLOUD_SHADOW_PARTIAL_STEPS: u32 = 3u;

/**
 * O resto de `q` com `light_steps` passos de luz do perfil (o pedaço segue: 3 no alto, de 6 de cone, 2 no médio, 1 no
 * baixo; espelho de `shadowPartialSteps`): o pedaço tem no máximo um trecho do mapa. Até o meio nó em 2 passos (T074,
 * rodada e) o τ do resto vinha mais do mapa filtrado entre colunas e o `sunset` ia a 4,0 % (com 3 passos até o meio nó,
 * 4,0; até o nó inteiro em 4 passos, 3,7; em 3, 3,6): o pedaço marchado é o que segue a coluna do ponto. 0 fora da
 * coluna do mapa.
 */
fn cloud_sun_rest(q: vec3f, light_steps: u32) -> f32 {
    let c = cloud_shadow_column(q);
    if (c.len <= 0.0) { return 0.0; }
    let sun = sky.sunDirection.xyz;
    let k = u32(floor(c.knot));
    let m = clamp(light_steps, 4u, 6u) - 3u;
    let dt = (c.knot - f32(k)) / CLOUD_SHADOW_LOOKUP_KNOTS * c.len / f32(m);
    var rho = 0.0;
    for (var i = 0u; i < CLOUD_SHADOW_PARTIAL_STEPS; i++) {
        if (i >= m) { break; }
        rho += cloud_density(q + sun * ((f32(i) + 0.5) * dt), true) * dt;
    }
    return rho * clouds.layer.z + cloud_shadow_knot(c, k);
}
