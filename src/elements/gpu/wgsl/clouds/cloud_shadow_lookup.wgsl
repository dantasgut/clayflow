// Transmitância das nuvens até o sol num ponto da cena (spec 041, R11 revisto): o mapa visto do sol por páginas
// (`cloud_shadow_pages`: os níveis em volta da câmera no plano do sol, o endereço toroidal das páginas no atlas) — por
// texel a profundidade ótica acumulada ao fim de cada um dos 16 trechos iguais do primeiro trecho da casca ao longo do
// raio que desce do sol (4 camadas × 4 nós) — lido com filtro (a borda da sombra é suave; o par do filtro fica sempre na
// página física). Na faixa de fora de cada nível (os 8 % de fora do raio útil), a mistura com o seguinte: a resolução
// muda sem costura; na troca de degrau da razão do texel à direita (`CloudShadowMaps`), a mistura dos dois mapas pelo
// peso do quadro: a resolução do mapa muda ao longo de `CLOUD_SHADOW_STEP_FRAMES` quadros, não num. O trecho da coluna do ponto é recalculado pela casca. Na superfície, τ é linear entre os nós e
// `T(p) = exp(−τ(p))`; a marcha da nuvem lê o nó do lado do sol (`cloud_shadow_knot`) e integra ela mesma o pedaço do
// trecho até o ponto (em `cloud_light`). Fora do mapa, a borda dele. A luz do sol nas superfícies
// (`cloud_shadow_transmittance_disk`) é a média sobre o disco do sol: a penumbra da nuvem distante. A página é escolhida
// pelo plano do quadro e lida pelo plano do sol do desenho dela (o registro da série, `cloud_shadow_records`).
// Requer: cloud_common, cloud_shadow_pages, clouds, cloud_shadow_tex, cloud_clamp_sampler, cloud_shadow_records.

const CLOUD_SHADOW_LOOKUP_KNOTS: f32 = 16.0;
/** As camadas do atlas: as 4 dos nós da coluna (4 por camada). */
const CLOUD_SHADOW_ATLAS_LAYERS: f32 = 4.0;

/**
 * A página de um ponto num nível de um degrau: a física, a global, o sol com que foi desenhada e a razão do texel à
 * direita do degrau. A página é escolhida pelo plano do quadro; o ponto é lido pelo plano do sol dela — a página refeita
 * há alguns quadros (o orçamento, com o sol andando) mostra a sombra como era no desenho dela, sem ler a coluna de outro
 * lugar.
 */
struct CloudShadowPageAt {
    slot: u32,
    g: vec2i,
    sun: vec3f,
    basis: mat2x3f,
    aspect: f32,
}

/**
 * A coluna do mapa que passa por um ponto: as páginas e as coordenadas no atlas nos dois níveis da mistura
 * (normalizadas) do mapa `entering` do quadro e o peso do segundo nível; na troca de degrau, as do mapa `leaving` (`qa`, `qb`,
 * `c`, `d`) e o peso dele (`other`; 0 fora da troca); a posição do ponto ao longo do trecho da casca em nós (0 na
 * entrada do lado do sol, 16 na saída; pelo sol da página do primeiro nível) e o comprimento do trecho (m; 0 sem casca).
 */
struct CloudShadowColumnAt {
    level: u32,
    pa: CloudShadowPageAt,
    pb: CloudShadowPageAt,
    a: vec2f,
    b: vec2f,
    blend: f32,
    qa: CloudShadowPageAt,
    qb: CloudShadowPageAt,
    c: vec2f,
    d: vec2f,
    other: f32,
    knot: f32,
    len: f32,
}

/** Os mapas do quadro (o registro de estado que a escolha do quadro gravou). */
fn cloud_shadow_maps() -> CloudShadowMaps {
    let r = cloud_shadow_records[CLOUD_SHADOW_STATE_SLOT];
    return CloudShadowMaps(u32(clamp(r.page_x, 0, 2)), u32(clamp(r.page_y, 0, 2)), clamp(r.time, 0.0, 1.0));
}

/** O sol com que a página física `slot` foi desenhada (o do quadro, se ela ainda não foi). */
fn cloud_shadow_page_sun(slot: u32) -> vec3f {
    let s = vec3f(cloud_shadow_records[slot].sun_x, cloud_shadow_records[slot].sun_y, cloud_shadow_records[slot].sun_z);
    return select(clouds.sunDir.xyz, s, dot(s, s) > 0.25);
}

/** A página do ponto `x` do plano do quadro no nível `k` do degrau `m` (presa à janela dele). */
fn cloud_shadow_page_at(x: vec2f, k: u32, m: u32) -> CloudShadowPageAt {
    let t = cloud_shadow_step_texel(k, m);
    let w = vec2f(cloud_shadow_window(k, m));
    let P = f32(CLOUD_SHADOW_PAGE);
    let N = vec2f(cloud_shadow_window_pages(m));
    let X = clamp(x / t, w * P + 0.5, (w + N) * P - 0.5);
    let g = vec2i(clamp(floor((X - 0.5) / P), w, w + N - 1.0));
    let slot = cloud_shadow_slot(k, g, m);
    let sun = cloud_shadow_page_sun(slot);
    return CloudShadowPageAt(slot, g, sun, cloud_shadow_basis(sun), cloud_shadow_step_aspect(m));
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
    let X = clamp(x / cloud_shadow_texel_aspect(k, pg.aspect), lo + 0.5, lo + P + 0.5);
    return (vec2f(cloud_shadow_slot_origin(pg.slot)) + X - lo) / CLOUD_SHADOW_ATLAS;
}

/**
 * A coluna de `p` (a posição ao longo do trecho sem saturar: além da saída, mais de 16). Sem trecho da casca na coluna,
 * ou com o ponto antes da entrada dele do lado do sol (nada entre o ponto e o sol: τ = 0 em qualquer leitura), `len` 0 e
 * nenhuma coordenada do atlas (T074: o ar acima das nuvens saía com as páginas e as coordenadas dos dois níveis feitas).
 */
fn cloud_shadow_column_far(p: vec3f) -> CloudShadowColumnAt {
    var c: CloudShadowColumnAt;
    let x = cloud_shadow_plane(p);
    let lv = cloud_shadow_level(x);
    let k = u32(lv.x);
    let maps = cloud_shadow_maps();
    c.level = k;
    c.pa = cloud_shadow_page_at(x, k, maps.entering);
    // A origem da coluna como a página a tem: do ponto do plano do mapa, a saída do topo da casca do lado do sol.
    let sun = c.pa.sun;
    let sigma = dot(p - clouds.sunFrame.xyz, sun);
    let q0 = p - sun * sigma;
    let entry = cloud_sun_entry(q0, sun);
    let d = entry - sigma;
    let segs = cloud_shell_segments(q0 + sun * entry, -sun, 1e9);
    if (segs.y <= segs.x || d <= segs.x) { return c; }
    c.knot = (d - segs.x) / (segs.y - segs.x) * CLOUD_SHADOW_LOOKUP_KNOTS;
    c.len = segs.y - segs.x;
    c.a = cloud_shadow_page_uv(p, c.pa, k, vec2f(0.0));
    c.pb = c.pa;
    c.b = c.a;
    c.blend = lv.y;
    if (lv.y > 0.0) {
        c.pb = cloud_shadow_page_at(x, k + 1u, maps.entering);
        c.b = cloud_shadow_page_uv(p, c.pb, k + 1u, vec2f(0.0));
    }
    c.qa = c.pa;
    c.qb = c.pb;
    c.c = c.a;
    c.d = c.b;
    c.other = 0.0;
    if (maps.leaving != maps.entering && maps.weight < 1.0) {
        c.other = 1.0 - maps.weight;
        c.qa = cloud_shadow_page_at(x, k, maps.leaving);
        c.c = cloud_shadow_page_uv(p, c.qa, k, vec2f(0.0));
        c.qb = c.qa;
        c.d = c.c;
        if (lv.y > 0.0) {
            c.qb = cloud_shadow_page_at(x, k + 1u, maps.leaving);
            c.d = cloud_shadow_page_uv(p, c.qb, k + 1u, vec2f(0.0));
        }
    }
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
    let layer = (f32(j / 4u) + 0.5) / CLOUD_SHADOW_ATLAS_LAYERS;
    return textureSampleLevel(cloud_shadow_tex, cloud_clamp_sampler, vec3f(uv, layer), 0.0)[j % 4u];
}

/**
 * Os nós `k` e `k + 1` (`k` de 0 a 15) num ponto normalizado do atlas (T074): os nós 4j + 1 … 4j + 4 ficam nos canais
 * da camada j — uma leitura quando os dois são da mesma camada, duas na virada (k = 4, 8, 12); o nó 0 é zero. Os mesmos
 * valores de duas `cloud_shadow_knot_uv`.
 */
fn cloud_shadow_knot_pair_uv(uv: vec2f, k: u32) -> vec2f {
    let c = k % 4u;
    let hi = textureSampleLevel(cloud_shadow_tex, cloud_clamp_sampler,
        vec3f(uv, (f32(k / 4u) + 0.5) / CLOUD_SHADOW_ATLAS_LAYERS), 0.0);
    if (k == 0u) { return vec2f(0.0, hi.x); }
    if (c != 0u) { return vec2f(hi[c - 1u], hi[c]); }
    let lo = textureSampleLevel(cloud_shadow_tex, cloud_clamp_sampler,
        vec3f(uv, (f32(k / 4u) - 0.5) / CLOUD_SHADOW_ATLAS_LAYERS), 0.0);
    return vec2f(lo.w, hi.x);
}

/** O nó `k` (0…16) nos dois níveis da mistura (os pontos `a`, `b` do atlas, o peso `blend` do segundo). */
fn cloud_shadow_knot_levels(a: vec2f, b: vec2f, blend: f32, k: u32) -> f32 {
    let v = cloud_shadow_knot_uv(a, k);
    if (blend <= 0.0) { return v; }
    return mix(v, cloud_shadow_knot_uv(b, k), blend);
}

/**
 * A profundidade ótica acumulada da entrada do lado do sol até o nó `k` (0…16) na coluna `c`: nos dois níveis e, na
 * troca de degrau, nos dois mapas.
 */
fn cloud_shadow_knot(c: CloudShadowColumnAt, k: u32) -> f32 {
    let v = cloud_shadow_knot_levels(c.a, c.b, c.blend, k);
    if (c.other <= 0.0) { return v; }
    return mix(v, cloud_shadow_knot_levels(c.c, c.d, c.blend, k), c.other);
}

/** Os nós `k` e `k + 1` (`k` de 0 a 15) nos dois níveis da mistura. */
fn cloud_shadow_knot_pair_levels(a: vec2f, b: vec2f, blend: f32, k: u32) -> vec2f {
    let v = cloud_shadow_knot_pair_uv(a, k);
    if (blend <= 0.0) { return v; }
    return mix(v, cloud_shadow_knot_pair_uv(b, k), blend);
}

/** Profundidade ótica das nuvens de `p` até o sol, linear entre os nós (a superfície). */
fn cloud_shadow_depth(p: vec3f) -> f32 {
    let c = cloud_shadow_column(p);
    if (c.len <= 0.0) { return 0.0; }
    let k = min(u32(floor(c.knot)), 15u);
    var v = cloud_shadow_knot_pair_levels(c.a, c.b, c.blend, k);
    if (c.other > 0.0) { v = mix(v, cloud_shadow_knot_pair_levels(c.c, c.d, c.blend, k), c.other); }
    return mix(v.x, v.y, c.knot - f32(k));
}

/** Os nós `k` e `k + 1` (`k` de 0 a 15) do texel `t` do atlas: uma leitura na mesma camada, duas na virada. */
fn cloud_shadow_knot_pair_texel(t: vec2i, k: u32) -> vec2f {
    let c = k % 4u;
    let hi = textureLoad(cloud_shadow_tex, vec3i(t, i32(k / 4u)), 0);
    if (k == 0u) { return vec2f(0.0, hi.x); }
    if (c != 0u) { return vec2f(hi[c - 1u], hi[c]); }
    return vec2f(textureLoad(cloud_shadow_tex, vec3i(t, i32(k / 4u) - 1), 0).w, hi.x);
}

/**
 * A transmitância `e^(−τ)` no ponto normalizado `uv` do atlas entre os nós `k` e `k + 1` (fração `f`): a bilinear das
 * transmitâncias dos quatro texels, não a de τ. Numa borda de sombra (τ 0 num texel, dezenas no vizinho) a média de τ
 * dá quase 0 onde metade da pegada tem sol (`e^(−τ̄) ≤ mean e^(−τ)`, Jensen); com texels de centenas de metros longe da
 * câmera, isso escurecia o ar e a nuvem rala na borda de cada sombra (`far-cloud`). O par do filtro fica na página
 * física. Teto: 8 leituras (4 com os dois nós na mesma camada).
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
        let v = cloud_shadow_knot_pair_texel(q, k);
        t += wt * exp(-mix(v.x, v.y, f));
    }
    return t;
}

/** A transmitância entre os nós `k` e `k + 1` (fração `f`) nos dois níveis da mistura (os pontos `a`, `b` do atlas). */
fn cloud_shadow_transmittance_levels(a: vec2f, b: vec2f, blend: f32, k: u32, f: f32) -> f32 {
    let v = cloud_shadow_transmittance_uv(a, k, f);
    if (blend <= 0.0) { return v; }
    return mix(v, cloud_shadow_transmittance_uv(b, k, f), blend);
}

/**
 * A transmitância na coluna `c` entre os nós `k` e `k + 1` (fração `f`), nos dois níveis da mistura e, na troca de
 * degrau, nos dois mapas.
 */
fn cloud_shadow_transmittance_column(c: CloudShadowColumnAt, k: u32, f: f32) -> f32 {
    let v = cloud_shadow_transmittance_levels(c.a, c.b, c.blend, k, f);
    if (c.other <= 0.0) { return v; }
    return mix(v, cloud_shadow_transmittance_levels(c.c, c.d, c.blend, k, f), c.other);
}

/** Leituras do disco do sol (pontos de Vogel, fixos: sem ruído entre quadros). */
const CLOUD_SHADOW_DISK_TAPS: u32 = 16u;
/** Profundidade ótica do centro de nuvem padrão (o meio do trecho) na média que acha a distância da nuvem. */
const CLOUD_SHADOW_BLOCKER_PRIOR: f32 = 0.1;

/** Os 16 nós da coluna nos quatro canais das quatro camadas, num ponto normalizado do atlas. */
fn cloud_shadow_layers(uv: vec2f) -> array<vec4f, 4> {
    var v: array<vec4f, 4>;
    for (var l = 0u; l < 4u; l++) {
        v[l] = textureSampleLevel(cloud_shadow_tex, cloud_clamp_sampler, vec3f(uv, (f32(l) + 0.5) / CLOUD_SHADOW_ATLAS_LAYERS), 0.0);
    }
    return v;
}

/**
 * Transmitância das nuvens até o disco do sol de raio angular `radius` (rad) em `p` (a superfície): a média de
 * `e^(−τ)` nas colunas do disco que a penumbra projeta no plano do mapa, de raio `dist·tan(radius)` — `dist` a
 * distância de `p` ao centro da nuvem na coluna (o centro dos nós até `p` ponderado por τ). Com o sol baixo a nuvem que
 * tapa o sol fica a 20–40 km do chão e a penumbra tem 100–200 m; com o sol pontual, a borda da nuvem passava pelo sol
 * num quadro do vídeo acelerado (o sol real leva ~0,5° para sair de trás dela). As leituras do disco nos mesmos dois
 * níveis do centro. Teto: 16 + 8·`CLOUD_SHADOW_DISK_TAPS` leituras e 16 nós (a metade fora da troca de degrau; sem a
 * mistura de níveis e com os dois nós na mesma camada, 4 + `CLOUD_SHADOW_DISK_TAPS`).
 */
fn cloud_shadow_transmittance_disk(p: vec3f, radius: f32) -> f32 {
    let far = cloud_shadow_column_far(p);
    if (far.len <= 0.0) { return 1.0; }
    let kn = clamp(far.knot, 0.0, CLOUD_SHADOW_LOOKUP_KNOTS);
    let k = min(u32(floor(kn)), 15u);
    let f = kn - f32(k);
    // Sem a mistura de níveis, o segundo ponto é o primeiro (`cloud_shadow_column_far`): a mesma leitura.
    let la = cloud_shadow_layers(far.a);
    var lb = la;
    if (far.blend > 0.0) { lb = cloud_shadow_layers(far.b); }
    var lc = la;
    var ld = lb;
    if (far.other > 0.0) {
        lc = cloud_shadow_layers(far.c);
        ld = lc;
        if (far.blend > 0.0) { ld = cloud_shadow_layers(far.d); }
    }
    var knots: array<f32, 17>;
    for (var l = 0u; l < 4u; l++) {
        let v = mix(mix(la[l], lb[l], far.blend), mix(lc[l], ld[l], far.blend), far.other);
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
    // A penumbra menor que o texel do nível (o lado maior: o texel à direita é mais fino) — as leituras do disco cairiam
    // na pegada da leitura bilinear: a transmitância dela.
    if (r < cloud_shadow_texel_aspect(far.level, 1.0).y) { return cloud_shadow_transmittance_column(far, k, f); }
    let k0 = far.level;
    var t = 0.0;
    for (var i = 0u; i < CLOUD_SHADOW_DISK_TAPS; i++) {
        let rho = sqrt((f32(i) + 0.5) / f32(CLOUD_SHADOW_DISK_TAPS));
        let phi = f32(i) * 2.3999632;
        let o = r * rho * vec2f(cos(phi), sin(phi));
        let va = cloud_shadow_knot_pair_uv(cloud_shadow_page_uv(p, far.pa, k0, o), k);
        var ta = mix(va.x, va.y, f);
        if (far.blend > 0.0) {
            let vb = cloud_shadow_knot_pair_uv(cloud_shadow_page_uv(p, far.pb, k0 + 1u, o), k);
            ta = mix(ta, mix(vb.x, vb.y, f), far.blend);
        }
        var tt = exp(-ta);
        // Na troca de degrau, o mesmo ponto do disco no mapa de onde, pelo peso dele.
        if (far.other > 0.0) {
            let vc = cloud_shadow_knot_pair_uv(cloud_shadow_page_uv(p, far.qa, k0, o), k);
            var tc = mix(vc.x, vc.y, f);
            if (far.blend > 0.0) {
                let vd = cloud_shadow_knot_pair_uv(cloud_shadow_page_uv(p, far.qb, k0 + 1u, o), k);
                tc = mix(tc, mix(vd.x, vd.y, f), far.blend);
            }
            tt = mix(tt, exp(-tc), far.other);
        }
        t += tt;
    }
    return t / f32(CLOUD_SHADOW_DISK_TAPS);
}
