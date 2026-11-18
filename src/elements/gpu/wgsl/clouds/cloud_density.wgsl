// Densidade das nuvens (spec 041, R3–R6): a cobertura (o mapa centrado na câmera; fora dele, os valores globais), o
// perfil de altura pelo tipo, a forma pelo volume periódico (Perlin-Worley remapeado pelo fBm de Worley) deslocado
// pelo vento e inclinado pela altura, e a erosão das bordas pelo volume de detalhe (com o vento, derivando para cima). Densidade relativa
// (≥ 0); a extinção é ela × `clouds.layer.z`. Espelho de `cloudDensity` em `cloudModel.ts`.
// Requer: cloud_coverage_field, cloud_common, clouds, cloud_shape_tex, cloud_detail_tex, cloud_coverage_tex, cloud_noise_sampler,
// cloud_clamp_sampler.

const CLOUD_EROSION: f32 = 0.35;
const CLOUD_SKEW: f32 = 0.5;

/** Cobertura, tipo e densidade relativa no ponto horizontal `xz` (m): o mapa e, fora dele, os campos da cobertura e do tipo. */
fn cloud_coverage_at(xz: vec2f) -> vec3f {
    let m = clouds.coverageMap;
    let uv = (xz - m.xy) / m.z + 0.5;
    if (any(uv < vec2f(0.0)) || any(uv > vec2f(1.0))) {
        let w = xz - clouds.coverageOffset.xy;
        return vec3f(cloud_coverage_field(w, clouds.layer.x, clouds.layer.y), cloud_type_field(w, clouds.layer.y), 1.0);
    }
    return textureSampleLevel(cloud_coverage_tex, cloud_clamp_sampler, uv, 0.0).rgb;
}

/**
 * O teto da densidade relativa em qualquer ponto: a densidade é no máximo a cobertura local × a densidade relativa (a
 * forma e a erosão só a reduzem: `remap(base, 1 − cov, 1)·cov ≤ cov` com `base ≤ 1`, e a erosão `(c − e)/(1 − e) ≤ c`).
 * Sem função de cobertura, a cobertura local é `g(c, tipo) + 0,4·(u − 0,5)` com `u < 1` — o teto `g + 0,2` (mais um
 * degrau do mapa de 8 bits); com função, 1. É o majorante do rastreamento delta dos caminhos do cache de espalhamento:
 * com a cobertura 0,5, ~0,63 — 37 % menos colisões nulas, sem viés.
 */
fn cloud_density_bound() -> f32 {
    if (clouds.flags.w != 0u) { return 1.0; }
    let k = clamp(clouds.layer.y * 2.0, 0.0, 1.0);
    let g = mix(cloud_coverage_inverse(clouds.layer.x, true), cloud_coverage_inverse(clouds.layer.x, false), k);
    return clamp(g + 0.5 * CLOUD_COVERAGE_SPREAD + 1.0 / 255.0, 0.0, 1.0);
}

/**
 * A densidade da forma sem o detalhe (`detail` falso: a marcha grossa no vazio e a sombra longa) ou com a erosão
 * (`detail` verdadeiro).
 */
fn cloud_density(p: vec3f, detail: bool) -> f32 {
    return cloud_density_above(p, detail, -1.0);
}

/**
 * A densidade com a erosão só quando a da forma sem ela passa de `floor`: abaixo, devolve a da forma (≤ `floor`) sem ler
 * o volume de detalhe — a erosão só reduz, então o rastreamento delta decide a colisão nula pelo teste da forma.
 */
fn cloud_density_above(p: vec3f, detail: bool, floor: f32) -> f32 {
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
    if (!detail || c * max(cov.z, 0.0) <= floor) { return c * max(cov.z, 0.0); }
    let pd = (p - clouds.detail.xyz) / clouds.detail.w;
    let d = textureSampleLevel(cloud_detail_tex, cloud_noise_sampler, pd, 0.0);
    let hf = d.g * 0.625 + d.b * 0.25 + d.a * 0.125;
    let hfm = mix(hf, 1.0 - hf, clamp(h * 10.0, 0.0, 1.0));
    return max(0.0, cloud_remap(c, hfm * CLOUD_EROSION, 1.0, 0.0, 1.0)) * max(cov.z, 0.0);
}
