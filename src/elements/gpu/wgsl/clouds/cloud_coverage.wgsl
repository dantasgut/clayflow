// Mapa de cobertura pela função de cobertura (spec 041, R4; em níveis por páginas, R21 rodada 19): o valor de um texel é a
// função de cobertura (ponto `cloud_coverage`: cobertura, tipo e densidade relativa no ponto horizontal do referencial
// que anda com o vento, no tempo simulado; sem função, os campos da camada) no centro dele. O desenho e a escolha das
// páginas são os de `cloud_coverage_draw`.
// Requer: clouds, cloud_coverage_fn_at.

/** O valor do mapa no ponto `w` (m, referencial do vento). */
fn cloud_coverage_value(w: vec2f) -> vec4f {
    let v = cloud_coverage_fn_at(w, clouds.coverageMap.w, clouds.flags.z);
    return vec4f(select(vec3f(0.0), v, v == v), 1.0);
}
