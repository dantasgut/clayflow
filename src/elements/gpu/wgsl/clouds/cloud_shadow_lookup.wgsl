// Transmitância das nuvens até o sol num ponto da cena (spec 041, R11 revisto): o mapa visto do sol por páginas
// (`cloud_shadow_pages`: os níveis em volta da câmera no plano do sol, o endereço toroidal das páginas no atlas) — por
// texel a profundidade ótica acumulada ao fim de cada um dos 16 trechos iguais do primeiro trecho da casca ao longo do
// raio que desce do sol (4 camadas × 4 nós) — lido com filtro (a borda da sombra é suave; o par do filtro fica sempre na
// página física). Na faixa de fora de cada nível (os 30 % de fora do raio útil), a mistura com o seguinte: a resolução
// muda sem costura. O trecho da coluna do ponto é recalculado pela casca. Na superfície, τ é linear entre os nós e
// `T(p) = exp(−τ(p))`; a marcha da nuvem lê o nó do lado do sol (`cloud_shadow_knot`) e integra ela mesma o pedaço do
// trecho até o ponto (em `cloud_light`). Fora do mapa, a borda dele. A luz do sol nas superfícies
// (`cloud_shadow_transmittance_disk`) é a média sobre o disco do sol: a penumbra da nuvem distante. A página é escolhida
// pelo plano do quadro e lida pelo plano do sol do desenho dela (o registro da série, `cloud_shadow_records`).
// Requer: cloud_common, cloud_shadow_pages, clouds, cloud_shadow_tex, cloud_clamp_sampler, cloud_shadow_records.

const CLOUD_SHADOW_LOOKUP_KNOTS: f32 = 16.0;

/**
 * A página de um ponto num nível: a física, a global e o sol com que foi desenhada. A página é escolhida pelo plano do
 * quadro; o ponto é lido pelo plano do sol dela — a página refeita há alguns quadros (o orçamento, com o sol andando)
 * mostra a sombra como era no desenho dela, sem ler a coluna de outro lugar.
 */
struct CloudShadowPageAt {
    slot: u32,
    g: vec2i,
    sun: vec3f,
    basis: mat2x3f,
}

/**
 * A coluna do mapa que passa por um ponto: as páginas e as coordenadas no atlas nos dois níveis da mistura
 * (normalizadas) e o peso do segundo, a posição do ponto ao longo do trecho da casca em nós (0 na entrada do lado do
 * sol, 16 na saída; pelo sol da página do primeiro nível) e o comprimento do trecho (m; 0 sem casca).
 */
struct CloudShadowColumnAt {
    level: u32,
    pa: CloudShadowPageAt,
    pb: CloudShadowPageAt,
    a: vec2f,
    b: vec2f,
    blend: f32,
    knot: f32,
    len: f32,
}

/** O sol com que a página física `slot` foi desenhada (o do quadro, se ela ainda não foi). */
fn cloud_shadow_page_sun(slot: u32) -> vec3f {
    let s = vec3f(cloud_shadow_records[slot].sun_x, cloud_shadow_records[slot].sun_y, cloud_shadow_records[slot].sun_z);
    return select(clouds.sunDir.xyz, s, dot(s, s) > 0.25);
}

/** A página do ponto `x` do plano do quadro no nível `k` (presa à janela). */
fn cloud_shadow_page_at(x: vec2f, k: u32) -> CloudShadowPageAt {
    let t = cloud_shadow_texel_size(k);
    let w = vec2f(cloud_shadow_window(k));
    let P = f32(CLOUD_SHADOW_PAGE);
    let N = f32(CLOUD_SHADOW_PAGES);
    let X = clamp(x / t, w * P + 0.5, (w + N) * P - 0.5);
    let g = vec2i(clamp(floor((X - 0.5) / P), w, w + N - 1.0));
    let slot = cloud_shadow_slot(k, g);
    let sun = cloud_shadow_page_sun(slot);
    return CloudShadowPageAt(slot, g, sun, cloud_shadow_basis(sun));
}

/**
 * As coordenadas normalizadas no atlas de `p` na página `pg` do nível `k`, pelo plano do sol dela, deslocado de `offset`
 * (m, nesse plano): o par do filtro preso à página física.
 */
fn cloud_shadow_page_uv(p: vec3f, pg: CloudShadowPageAt, k: u32, offset: vec2f) -> vec2f {
    let rel = p - clouds.sunFrame.xyz;
    let x = vec2f(dot(rel, pg.basis[0]), dot(rel, pg.basis[1])) + offset;
    let P = f32(CLOUD_SHADOW_PAGE);
    let lo = vec2f(pg.g) * P;
    let X = clamp(x / cloud_shadow_texel_aspect(k, cloud_shadow_aspect(pg.sun)), lo + 0.5, lo + P + 0.5);
    return (vec2f(cloud_shadow_slot_origin(pg.slot)) + X - lo) / CLOUD_SHADOW_ATLAS;
}

/** A coluna de `p` (a posição ao longo do trecho sem saturar: além da saída, mais de 16). */
fn cloud_shadow_column_far(p: vec3f) -> CloudShadowColumnAt {
    var c: CloudShadowColumnAt;
    let x = cloud_shadow_plane(p);
    let lv = cloud_shadow_level(x);
    let k = u32(lv.x);
    c.level = k;
    c.pa = cloud_shadow_page_at(x, k);
    c.a = cloud_shadow_page_uv(p, c.pa, k, vec2f(0.0));
    c.pb = c.pa;
    c.b = c.a;
    c.blend = lv.y;
    if (lv.y > 0.0) {
        c.pb = cloud_shadow_page_at(x, k + 1u);
        c.b = cloud_shadow_page_uv(p, c.pb, k + 1u, vec2f(0.0));
    }
    // A origem da coluna como a página a tem: do ponto do plano do mapa, a saída do topo da casca do lado do sol.
    let sun = c.pa.sun;
    let sigma = dot(p - clouds.sunFrame.xyz, sun);
    let q0 = p - sun * sigma;
    let entry = cloud_sun_entry(q0, sun);
    let d = entry - sigma;
    let segs = cloud_shell_segments(q0 + sun * entry, -sun, 1e9);
    if (segs.y <= segs.x) { return c; }
    c.knot = (d - segs.x) / (segs.y - segs.x) * CLOUD_SHADOW_LOOKUP_KNOTS;
    c.len = segs.y - segs.x;
    return c;
}

/** A coluna de `p` com a posição saturada ao trecho (0…16). */
fn cloud_shadow_column(p: vec3f) -> CloudShadowColumnAt {
    var c = cloud_shadow_column_far(p);
    c.knot = clamp(c.knot, 0.0, CLOUD_SHADOW_LOOKUP_KNOTS);
    return c;
}

/** O nó `k` (0…16) num ponto normalizado do atlas. */
fn cloud_shadow_knot_uv(uv: vec2f, k: u32) -> f32 {
    if (k == 0u) { return 0.0; }
    let j = min(k, 16u) - 1u;
    let layer = (f32(j / 4u) + 0.5) * 0.25;
    return textureSampleLevel(cloud_shadow_tex, cloud_clamp_sampler, vec3f(uv, layer), 0.0)[j % 4u];
}

/** A profundidade ótica acumulada da entrada do lado do sol até o nó `k` (0…16) na coluna `c`. */
fn cloud_shadow_knot(c: CloudShadowColumnAt, k: u32) -> f32 {
    let a = cloud_shadow_knot_uv(c.a, k);
    if (c.blend <= 0.0) { return a; }
    return mix(a, cloud_shadow_knot_uv(c.b, k), c.blend);
}

/** Profundidade ótica das nuvens de `p` até o sol, linear entre os nós (a superfície). */
fn cloud_shadow_depth(p: vec3f) -> f32 {
    let c = cloud_shadow_column(p);
    if (c.len <= 0.0) { return 0.0; }
    let k = min(u32(floor(c.knot)), 15u);
    return mix(cloud_shadow_knot(c, k), cloud_shadow_knot(c, k + 1u), c.knot - f32(k));
}

/** O nó `k` (0…16) do texel `t` do atlas. */
fn cloud_shadow_knot_texel(t: vec2i, k: u32) -> f32 {
    if (k == 0u) { return 0.0; }
    let j = min(k, 16u) - 1u;
    return textureLoad(cloud_shadow_tex, vec3i(t, i32(j / 4u)), 0)[j % 4u];
}

/**
 * A transmitância `e^(−τ)` no ponto normalizado `uv` do atlas entre os nós `k` e `k + 1` (fração `f`): a bilinear das
 * transmitâncias dos quatro texels, não a de τ. Numa borda de sombra (τ 0 num texel, dezenas no vizinho) a média de τ
 * dá quase 0 onde metade da pegada tem sol (`e^(−τ̄) ≤ mean e^(−τ)`, Jensen); com texels de centenas de metros longe da
 * câmera, isso escurecia o ar e a nuvem rala na borda de cada sombra (`far-cloud`). O par do filtro fica na página
 * física. Teto: 8 leituras.
 */
fn cloud_shadow_transmittance_uv(uv: vec2f, k: u32, f: f32) -> f32 {
    let p = uv * CLOUD_SHADOW_ATLAS - 0.5;
    let b = vec2i(floor(p));
    let w = p - floor(p);
    var t = 0.0;
    for (var i = 0; i < 4; i++) {
        let o = vec2i(i & 1, i >> 1);
        let q = b + o;
        let wt = select(1.0 - w.x, w.x, o.x == 1) * select(1.0 - w.y, w.y, o.y == 1);
        t += wt * exp(-mix(cloud_shadow_knot_texel(q, k), cloud_shadow_knot_texel(q, k + 1u), f));
    }
    return t;
}

/** A transmitância na coluna `c` entre os nós `k` e `k + 1` (fração `f`), nos dois níveis da mistura. */
fn cloud_shadow_transmittance_column(c: CloudShadowColumnAt, k: u32, f: f32) -> f32 {
    let a = cloud_shadow_transmittance_uv(c.a, k, f);
    if (c.blend <= 0.0) { return a; }
    return mix(a, cloud_shadow_transmittance_uv(c.b, k, f), c.blend);
}

/** Leituras do disco do sol (pontos de Vogel, fixos: sem ruído entre quadros). */
const CLOUD_SHADOW_DISK_TAPS: u32 = 16u;
/** Profundidade ótica do centro de nuvem padrão (o meio do trecho) na média que acha a distância da nuvem. */
const CLOUD_SHADOW_BLOCKER_PRIOR: f32 = 0.1;

/** Os 16 nós da coluna nos quatro canais das quatro camadas, num ponto normalizado do atlas. */
fn cloud_shadow_layers(uv: vec2f) -> array<vec4f, 4> {
    var v: array<vec4f, 4>;
    for (var l = 0u; l < 4u; l++) {
        v[l] = textureSampleLevel(cloud_shadow_tex, cloud_clamp_sampler, vec3f(uv, (f32(l) + 0.5) * 0.25), 0.0);
    }
    return v;
}

/**
 * Transmitância das nuvens até o disco do sol de raio angular `radius` (rad) em `p` (a superfície): a média de
 * `e^(−τ)` nas colunas do disco que a penumbra projeta no plano do mapa, de raio `dist·tan(radius)` — `dist` a
 * distância de `p` ao centro da nuvem na coluna (o centro dos nós até `p` ponderado por τ). Com o sol baixo a nuvem que
 * tapa o sol fica a 20–40 km do chão e a penumbra tem 100–200 m; com o sol pontual, a borda da nuvem passava pelo sol
 * num quadro do vídeo acelerado (o sol real leva ~0,5° para sair de trás dela). As leituras do disco nos mesmos dois
 * níveis do centro. Teto: 8 + 4·`CLOUD_SHADOW_DISK_TAPS` leituras e 16 nós.
 */
fn cloud_shadow_transmittance_disk(p: vec3f, radius: f32) -> f32 {
    let far = cloud_shadow_column_far(p);
    if (far.len <= 0.0) { return 1.0; }
    let kn = clamp(far.knot, 0.0, CLOUD_SHADOW_LOOKUP_KNOTS);
    let k = min(u32(floor(kn)), 15u);
    let f = kn - f32(k);
    let la = cloud_shadow_layers(far.a);
    let lb = cloud_shadow_layers(far.b);
    var knots: array<f32, 17>;
    for (var l = 0u; l < 4u; l++) {
        let v = mix(la[l], lb[l], far.blend);
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
        let hi = min(f32(j), kn);
        let lo = f32(j - 1u);
        if (hi <= lo) { break; }
        let dtau = (knots[j] - knots[j - 1u]) * (hi - lo);
        moment += dtau * 0.5 * (lo + hi);
    }
    let centroid = (moment + CLOUD_SHADOW_BLOCKER_PRIOR * 0.5 * kn) / (tau + CLOUD_SHADOW_BLOCKER_PRIOR);
    let dist = max(far.knot - centroid, 0.0) / CLOUD_SHADOW_LOOKUP_KNOTS * far.len;
    let r = dist * tan(radius);
    // A penumbra menor que o texel do nível: as leituras do disco cairiam na mesma pegada — a transmitância dela.
    if (r < cloud_shadow_texel_size(far.level).x) { return cloud_shadow_transmittance_column(far, k, f); }
    let k0 = far.level;
    var t = 0.0;
    for (var i = 0u; i < CLOUD_SHADOW_DISK_TAPS; i++) {
        let rho = sqrt((f32(i) + 0.5) / f32(CLOUD_SHADOW_DISK_TAPS));
        let phi = f32(i) * 2.3999632;
        let o = r * rho * vec2f(cos(phi), sin(phi));
        let ua = cloud_shadow_page_uv(p, far.pa, k0, o);
        var ta = mix(cloud_shadow_knot_uv(ua, k), cloud_shadow_knot_uv(ua, k + 1u), f);
        if (far.blend > 0.0) {
            let ub = cloud_shadow_page_uv(p, far.pb, k0 + 1u, o);
            ta = mix(ta, mix(cloud_shadow_knot_uv(ub, k), cloud_shadow_knot_uv(ub, k + 1u), f), far.blend);
        }
        t += exp(-ta);
    }
    return t / f32(CLOUD_SHADOW_DISK_TAPS);
}
