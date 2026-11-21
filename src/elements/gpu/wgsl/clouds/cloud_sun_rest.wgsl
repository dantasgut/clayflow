// O resto da profundidade ótica até o sol depois do cone curto da luz (spec 041, R11; T074): de `q` (o fim do cone), o
// pedaço do trecho do mapa visto do sol até o meio nó do lado do sol, integrado em `CLOUD_SHADOW_PARTIAL_STEPS` passos, e o
// meio nó, lido do mapa (a integral da coluna da entrada da casca até ele). O que a marcha soma ao cone em cada amostra e
// o que o volume de τ até o sol guarda no segundo canal de cada nó. Espelho do resto de `cloud_sun_depth` (`cloudModel.ts`,
// `shadowDepthMarched`).
// Requer: cloud_density, cloud_shadow_lookup, sky, clouds.

/** Passos do pedaço do trecho do mapa visto do sol entre o fim do cone e o meio nó do lado do sol. */
const CLOUD_SHADOW_PARTIAL_STEPS: u32 = 2u;

/**
 * O resto de `q` com `light_steps` passos de luz do perfil (o pedaço segue: 2 no alto, de 6 de cone, e no médio, 1 no
 * baixo): o pedaço tem no máximo meio trecho do mapa, e metade das amostras de antes o percorre com o mesmo espaçamento.
 * 0 fora da coluna do mapa.
 */
fn cloud_sun_rest(q: vec3f, light_steps: u32) -> f32 {
    let c = cloud_shadow_column(q);
    if (c.len <= 0.0) { return 0.0; }
    let sun = sky.sunDirection.xyz;
    let kh = 2.0 * c.knot;
    let h = u32(floor(kh));
    let m = max((clamp(light_steps, 4u, 6u) - 1u) / 2u, 1u);
    let dt = (kh - f32(h)) / (2.0 * CLOUD_SHADOW_LOOKUP_KNOTS) * c.len / f32(m);
    var rho = 0.0;
    for (var i = 0u; i < CLOUD_SHADOW_PARTIAL_STEPS; i++) {
        if (i >= m) { break; }
        rho += cloud_density(q + sun * ((f32(i) + 0.5) * dt), true) * dt;
    }
    return rho * clouds.layer.z + cloud_shadow_half_knot(c, h);
}
