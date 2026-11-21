// A leitura do cache de espalhamento das nuvens (spec 041, T023, R8; T074): a fatia do quadro da série filtrada no espaço
// (`cloud_scatter_filter`) lida com filtro trilinear nas duas metades — a parte do sol por unidade da luz do sol que chega
// à sonda e a contagem (a de baixo), a parte do céu por unidade da irradiância do céu (a de cima) —, de volta à unidade da
// cena pelo sol e pelo céu de agora no ponto lido e misturada à estimativa local.
// Requer: cloud_scatter_grid, sky, clouds, cloud_scatter_filtered_tex, cloud_clamp_sampler, cloud_ambient_tex.

/** O piso da transmitância da atmosfera na parte do sol (`CLOUD_SCATTER_SUN_FLOOR` da referência). */
const CLOUD_SCATTER_SUN_FLOOR: f32 = 1e-3;
/** O piso da irradiância do céu na parte do céu (`CLOUD_SCATTER_SKY_FLOOR`). */
const CLOUD_SCATTER_SKY_FLOOR: f32 = 1e-9;

/** A irradiância do céu de cima, a unidade da parte do céu (com o piso). */
fn cloud_scatter_sky_unit() -> vec3f {
    return max(textureLoad(cloud_ambient_tex, vec2u(0u, 0u), 0).rgb, vec3f(CLOUD_SCATTER_SKY_FLOOR));
}

/**
 * A luz das sondas em `p`, misturada à estimativa `prior` (as oitavas e o ambiente local, na mesma unidade), com `atm` a
 * transmitância da atmosfera até `p` (`cloud_sun_atmosphere`): as somas filtradas das duas partes — a do sol × a
 * iluminância do sol × `atm` (com o piso), a do céu × a irradiância do céu — com o peso `CLOUD_SCATTER_PRIOR` para a
 * estimativa local (espelho de `scatterRecompose`). Fora da grade, a estimativa local.
 */
fn cloud_scatter_light(p: vec3f, prior: vec3f, atm: vec3f) -> vec3f {
    let uvw = cloud_scatter_uvw(p);
    if (any(uvw.xz < vec2f(0.0)) || any(uvw.xz > vec2f(1.0))) { return prior; }
    // A altitude presa a meio texel dentro de cada metade (o filtro não mistura as duas partes).
    let n = f32(clouds.scatterSize.y);
    let y = clamp(uvw.y * n, 0.5, n - 0.5) / (2.0 * n);
    let xz = clamp(uvw.xz, vec2f(0.0), vec2f(1.0));
    let qs = textureSampleLevel(cloud_scatter_filtered_tex, cloud_clamp_sampler, vec3f(xz.x, y, xz.y), 0.0);
    let qk = textureSampleLevel(cloud_scatter_filtered_tex, cloud_clamp_sampler, vec3f(xz.x, y + 0.5, xz.y), 0.0);
    let sun = sky.sunIlluminance.rgb * max(atm, vec3f(CLOUD_SCATTER_SUN_FLOOR));
    let n0 = clouds.scatterParams.x;
    return (qs.rgb * sun + qk.rgb * cloud_scatter_sky_unit() + n0 * prior) / (max(qs.a, 0.0) + n0);
}
