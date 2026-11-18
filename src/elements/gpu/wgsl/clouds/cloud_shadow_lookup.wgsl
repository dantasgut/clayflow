// Transmitância das nuvens até o sol num ponto da cena (spec 041, R11): o mapa visto do sol (projeção ortográfica
// centrada na câmera, coordenadas deformadas por asinh, `clouds.sunWarp`) — por texel a profundidade ótica acumulada ao fim de cada
// um dos 16 trechos iguais do primeiro trecho da casca ao longo do raio que desce do sol (4 camadas × 4 nós) — lido com
// filtro (a borda da sombra é suave). O trecho da coluna do ponto é recalculado pela casca. Na superfície, τ é linear
// entre os nós e `T(p) = exp(−τ(p))`; a marcha da nuvem lê o nó do lado do sol (`cloud_shadow_knot`) e integra ela
// mesma o pedaço do trecho até o ponto (em `cloud_light`). Fora do mapa, a borda dele. A luz do sol nas superfícies
// (`cloud_shadow_transmittance_disk`) é a média sobre o disco do sol: a penumbra da nuvem distante.
// Requer: cloud_common, clouds, cloud_shadow_tex, cloud_clamp_sampler.

const CLOUD_SHADOW_LOOKUP_KNOTS: f32 = 16.0;

/** (u, v) do mapa do ponto de coordenadas `x` (m) no plano dele (direita, cima, a partir do centro). */
fn cloud_shadow_uv(x: vec2f) -> vec2f {
    let w = clouds.sunWarp;
    return vec2f(asinh(x.x / w.x) / w.y, asinh(x.y / w.z) / w.w) * 0.5 + 0.5;
}

/**
 * A coluna do mapa que passa por `p`: (u, v) do texel, a posição de `p` ao longo do trecho da casca em nós (0 na entrada
 * do lado do sol, 16 na saída; sem saturar: além da saída, mais de 16) e o comprimento do trecho (m); comprimento 0
 * sem casca.
 */
fn cloud_shadow_column_far(p: vec3f) -> vec4f {
    let sun = clouds.sunDir.xyz;
    let rel = p - clouds.sunFrame.xyz;
    let uv = cloud_shadow_uv(vec2f(dot(rel, clouds.sunRight.xyz), dot(rel, clouds.sunUp.xyz)));
    // A origem da coluna como o mapa a tem: do ponto do plano do mapa, a saída do topo da casca do lado do sol.
    let sigma = dot(rel, sun);
    let q0 = p - sun * sigma;
    let entry = cloud_sun_entry(q0, sun);
    let d = entry - sigma;
    let segs = cloud_shell_segments(q0 + sun * entry, -sun, 1e9);
    if (segs.y <= segs.x) { return vec4f(uv, 0.0, 0.0); }
    return vec4f(uv, (d - segs.x) / (segs.y - segs.x) * CLOUD_SHADOW_LOOKUP_KNOTS, segs.y - segs.x);
}

/** A coluna de `p` com a posição saturada ao trecho (0…16). */
fn cloud_shadow_column(p: vec3f) -> vec4f {
    let c = cloud_shadow_column_far(p);
    return vec4f(c.xy, clamp(c.z, 0.0, CLOUD_SHADOW_LOOKUP_KNOTS), c.w);
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

/** Leituras do disco do sol (pontos de Vogel, fixos: sem ruído entre quadros). */
const CLOUD_SHADOW_DISK_TAPS: u32 = 16u;
/** Profundidade ótica do centro de nuvem padrão (o meio do trecho) na média que acha a distância da nuvem. */
const CLOUD_SHADOW_BLOCKER_PRIOR: f32 = 0.1;

/**
 * Transmitância das nuvens até o disco do sol de raio angular `radius` (rad) em `p` (a superfície): a média de
 * `e^(−τ)` nas colunas do disco que a penumbra projeta no plano do mapa, de raio `dist·tan(radius)` — `dist` a
 * distância de `p` ao centro da nuvem na coluna (o centro dos nós até `p` ponderado por τ). Com o sol baixo a nuvem que
 * tapa o sol fica a 20–40 km do chão e a penumbra tem 100–200 m; com o sol pontual, a borda da nuvem passava pelo sol
 * num quadro do vídeo acelerado (o sol real leva ~0,5° para sair de trás dela). Teto: 4 + 2·`CLOUD_SHADOW_DISK_TAPS`
 * leituras e 16 nós.
 */
fn cloud_shadow_transmittance_disk(p: vec3f, radius: f32) -> f32 {
    let far = cloud_shadow_column_far(p);
    if (far.w <= 0.0) { return 1.0; }
    let c = vec4f(far.xy, clamp(far.z, 0.0, CLOUD_SHADOW_LOOKUP_KNOTS), far.w);
    let k = min(u32(floor(c.z)), 15u);
    let f = c.z - f32(k);
    var knots: array<f32, 17>;
    for (var l = 0u; l < 4u; l++) {
        let v = textureSampleLevel(cloud_shadow_tex, cloud_clamp_sampler, vec3f(c.xy, (f32(l) + 0.5) * 0.25), 0.0);
        knots[l * 4u + 1u] = v.x;
        knots[l * 4u + 2u] = v.y;
        knots[l * 4u + 3u] = v.z;
        knots[l * 4u + 4u] = v.w;
    }
    let tau = mix(knots[k], knots[k + 1u], f);
    // O centro da nuvem entre a entrada e `p` (em nós), ponderado pela profundidade ótica de cada trecho; sem nuvem na
    // coluna, o meio do trecho (`CLOUD_SHADOW_BLOCKER_PRIOR` de τ nele: o centro contínuo quando τ vai a 0 — a coluna de
    // `p` limpa ao lado de vizinhas na sombra ainda tem a penumbra delas).
    var moment = 0.0;
    for (var j = 1u; j <= 16u; j++) {
        let hi = min(f32(j), c.z);
        let lo = f32(j - 1u);
        if (hi <= lo) { break; }
        let dtau = (knots[j] - knots[j - 1u]) * (hi - lo);
        moment += dtau * 0.5 * (lo + hi);
    }
    let centroid = (moment + CLOUD_SHADOW_BLOCKER_PRIOR * 0.5 * c.z) / (tau + CLOUD_SHADOW_BLOCKER_PRIOR);
    let dist = max(far.z - centroid, 0.0) / CLOUD_SHADOW_LOOKUP_KNOTS * c.w;
    let r = dist * tan(radius);
    if (r < 1.0) { return exp(-tau); }
    let rel = p - clouds.sunFrame.xyz;
    let x = vec2f(dot(rel, clouds.sunRight.xyz), dot(rel, clouds.sunUp.xyz));
    var t = 0.0;
    for (var i = 0u; i < CLOUD_SHADOW_DISK_TAPS; i++) {
        let rho = sqrt((f32(i) + 0.5) / f32(CLOUD_SHADOW_DISK_TAPS));
        let phi = f32(i) * 2.3999632;
        let uv = cloud_shadow_uv(x + r * rho * vec2f(cos(phi), sin(phi)));
        t += exp(-mix(cloud_shadow_knot(uv, k), cloud_shadow_knot(uv, k + 1u), f));
    }
    return t / f32(CLOUD_SHADOW_DISK_TAPS);
}
