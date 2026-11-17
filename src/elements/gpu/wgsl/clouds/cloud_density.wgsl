// Densidade das nuvens (spec 041, R3–R6): a cobertura (o mapa centrado na câmera; fora dele, os valores globais), o
// perfil de altura pelo tipo, a forma pelo volume periódico (Perlin-Worley remapeado pelo fBm de Worley) deslocado
// pelo vento e inclinado pela altura, e a erosão das bordas pelo volume de detalhe (1,5× o vento). Densidade relativa
// (≥ 0); a extinção é ela × `clouds.layer.z`. Espelho de `cloudDensity` em `cloudModel.ts`.
// Requer: cloud_common, clouds, cloud_shape_tex, cloud_detail_tex, cloud_coverage_tex, cloud_noise_sampler,
// cloud_clamp_sampler.

const CLOUD_EROSION: f32 = 0.35;
const CLOUD_SKEW: f32 = 0.5;

/** Cobertura, tipo e densidade relativa no ponto horizontal `xz` (m). */
fn cloud_coverage_at(xz: vec2f) -> vec3f {
    let m = clouds.coverageMap;
    let uv = (xz - m.xy) / m.z + 0.5;
    if (any(uv < vec2f(0.0)) || any(uv > vec2f(1.0))) { return vec3f(clouds.layer.x, clouds.layer.y, 1.0); }
    return textureSampleLevel(cloud_coverage_tex, cloud_clamp_sampler, uv, 0.0).rgb;
}

/**
 * A densidade da forma sem o detalhe (`detail` falso: a marcha grossa no vazio e a sombra longa) ou com a erosão
 * (`detail` verdadeiro).
 */
fn cloud_density(p: vec3f, detail: bool) -> f32 {
    let h = cloud_height_fraction(p);
    if (h <= 0.0 || h >= 1.0) { return 0.0; }
    let cov = cloud_coverage_at(p.xz);
    if (cov.x <= 0.0) { return 0.0; }
    let profile = cloud_height_profile(h, cov.y);
    if (profile <= 0.0) { return 0.0; }
    let skew = CLOUD_SKEW * clouds.shell.w * h;
    let ps = (p - clouds.shape.xyz - vec3f(clouds.wind.x * skew, 0.0, clouds.wind.y * skew)) / clouds.shape.w;
    let s = textureSampleLevel(cloud_shape_tex, cloud_noise_sampler, ps, 0.0);
    let low = s.g * 0.625 + s.b * 0.25 + s.a * 0.125;
    let base = cloud_remap(s.r, low - 1.0, 1.0, 0.0, 1.0) * profile;
    var c = base;
    if (cov.x < 1.0) { c = cloud_remap(base, 1.0 - cov.x, 1.0, 0.0, 1.0) * cov.x; }
    if (c <= 0.0) { return 0.0; }
    if (!detail) { return c * max(cov.z, 0.0); }
    let pd = (p - clouds.detail.xyz) / clouds.detail.w;
    let d = textureSampleLevel(cloud_detail_tex, cloud_noise_sampler, pd, 0.0);
    let hf = d.g * 0.625 + d.b * 0.25 + d.a * 0.125;
    let hfm = mix(hf, 1.0 - hf, clamp(h * 10.0, 0.0, 1.0));
    return max(0.0, cloud_remap(c, hfm * CLOUD_EROSION, 1.0, 0.0, 1.0)) * max(cov.z, 0.0);
}
