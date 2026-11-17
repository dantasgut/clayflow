// Transmitância das nuvens até o sol num ponto da cena (spec 041, R11): o mapa visto do sol (projeção ortográfica
// centrada na câmera, coordenadas deformadas por asinh, `clouds.sunWarp`) — por texel a profundidade ótica acumulada ao fim de cada
// um dos 16 trechos iguais do primeiro trecho da casca ao longo do raio que desce do sol (4 camadas × 4 nós) — lido com
// filtro (a borda da sombra é suave). O trecho da coluna do ponto é recalculado pela casca. Na superfície, τ é linear
// entre os nós e `T(p) = exp(−τ(p))`; a marcha da nuvem lê o nó do lado do sol (`cloud_shadow_knot`) e integra ela
// mesma o pedaço do trecho até o ponto (em `cloud_light`). Fora do mapa, a borda dele.
// Requer: cloud_common, clouds, cloud_shadow_tex, cloud_clamp_sampler.

const CLOUD_SHADOW_LOOKUP_KNOTS: f32 = 16.0;

/**
 * A coluna do mapa que passa por `p`: (u, v) do texel, a posição de `p` no trecho da casca em nós (0 na entrada do lado
 * do sol, 16 na saída; fora: saturada) e o comprimento do trecho (m); comprimento 0 sem casca.
 */
fn cloud_shadow_column(p: vec3f) -> vec4f {
    let sun = clouds.sunDir.xyz;
    let rel = p - clouds.sunFrame.xyz;
    let w = clouds.sunWarp;
    let x = vec2f(dot(rel, clouds.sunRight.xyz), dot(rel, clouds.sunUp.xyz));
    let uv = vec2f(asinh(x.x / w.x) / w.y, asinh(x.y / w.z) / w.w) * 0.5 + 0.5;
    let d = clouds.sunRight.w - dot(rel, sun);
    let segs = cloud_shell_segments(p + sun * d, -sun, 1e9);
    if (segs.y <= segs.x) { return vec4f(uv, 0.0, 0.0); }
    let s = clamp((d - segs.x) / (segs.y - segs.x), 0.0, 1.0) * CLOUD_SHADOW_LOOKUP_KNOTS;
    return vec4f(uv, s, segs.y - segs.x);
}

/** A profundidade ótica acumulada da entrada do lado do sol até o nó `k` (0…16) na coluna `uv`. */
fn cloud_shadow_knot(uv: vec2f, k: u32) -> f32 {
    if (k == 0u) { return 0.0; }
    let j = min(k, 16u) - 1u;
    let layer = (f32(j / 4u) + 0.5) * 0.25;
    return textureSampleLevel(cloud_shadow_tex, cloud_clamp_sampler, vec3f(uv, layer), 0.0)[j % 4u];
}

/** Profundidade ótica das nuvens de `p` até o sol, linear entre os nós (a superfície). */
fn cloud_shadow_depth(p: vec3f) -> f32 {
    let c = cloud_shadow_column(p);
    if (c.w <= 0.0) { return 0.0; }
    let k = min(u32(floor(c.z)), 15u);
    return mix(cloud_shadow_knot(c.xy, k), cloud_shadow_knot(c.xy, k + 1u), c.z - f32(k));
}

fn cloud_shadow_transmittance(p: vec3f) -> f32 {
    return exp(-cloud_shadow_depth(p));
}
