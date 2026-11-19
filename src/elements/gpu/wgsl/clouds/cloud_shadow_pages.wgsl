// O mapa visto do sol por páginas (spec 041, R11 revisto, T029): o endereçamento do atlas, comum ao desenho das páginas,
// às provas, à escolha do quadro e à leitura. Espelho de `reference/cloudShadowPages.ts`.
//
// Um mapa de recortes no plano perpendicular ao sol: `CLOUD_SHADOW_LEVELS` níveis, o texel do nível `k` é
// `clouds.sunMap.x·2ᵏ`, e cada nível tem `CLOUD_SHADOW_PAGES²` páginas de `CLOUD_SHADOW_PAGE²` texels em volta da câmera
// (a janela presa à página). O plano passa pelo pivô `clouds.sunFrame.xyz` — o vento × tempo mais a célula da grade do
// pivô —: o conteúdo de uma página anda com as nuvens, e o vento uniforme não a invalida. A base do plano (`sunRight`,
// `sunUp`) é a rotação mínima de +y ao sol (contínua: o sol que anda gira o plano aos poucos); a câmera no plano em
// `sunRight.w`, `sunUp.w`. Endereço toroidal (`g mod N`, como a tabela do mapa de sombra virtual da 034); todas as
// páginas da janela residentes, e a que entra na janela é desenhada no mesmo quadro. A página física tem um texel a mais
// em +x e +y (a coluna da vizinha): o par do filtro bilinear fica sempre nela.
// Requer: clouds.

/** Texels por lado do interior de uma página. */
const CLOUD_SHADOW_PAGE: u32 = 16u;
/** Texels por lado da página física (o interior e a coluna da vizinha em +x e +y). */
const CLOUD_SHADOW_STRIDE: u32 = 17u;
/** Texels de uma página física. */
const CLOUD_SHADOW_PAGE_TEXELS: u32 = 289u;
/** Páginas por lado de um nível. */
const CLOUD_SHADOW_PAGES: u32 = 8u;
/** Níveis do mapa. */
const CLOUD_SHADOW_LEVELS: u32 = 8u;
/** Páginas físicas por linha do atlas. */
const CLOUD_SHADOW_SLOTS_X: u32 = 23u;
/** Páginas no atlas (as janelas de todos os níveis). */
const CLOUD_SHADOW_SLOT_COUNT: u32 = 512u;
/** Lado do atlas em texels. */
const CLOUD_SHADOW_ATLAS: f32 = 391.0;
/** Colunas de prova por página por quadro. */
const CLOUD_SHADOW_PROBES: u32 = 4u;

/** A razão entre o texel em cima e o à direita (texels quadrados). */
fn cloud_shadow_aspect(s: vec3f) -> f32 {
    return 1.0;
}

/** Texel (m, à direita e em cima) do nível `k` com a razão `a`. */
fn cloud_shadow_texel_aspect(k: u32, a: f32) -> vec2f {
    return clouds.sunMap.x * exp2(f32(k)) * vec2f(1.0, a);
}

/** Texel (m, à direita e em cima) do nível `k` no plano do quadro. */
fn cloud_shadow_texel_size(k: u32) -> vec2f {
    return cloud_shadow_texel_aspect(k, cloud_shadow_aspect(clouds.sunDir.xyz));
}

/** Raio útil (m, Chebyshev na direita; em cima, × a razão) do nível `k`: a janela menos a borda do filtro e da penumbra. */
fn cloud_shadow_usable(k: u32) -> f32 {
    return f32((CLOUD_SHADOW_PAGES / 2u - 1u) * CLOUD_SHADOW_PAGE - 2u) * cloud_shadow_texel_size(k).x;
}

/** A câmera no plano (m). */
fn cloud_shadow_camera() -> vec2f {
    return vec2f(clouds.sunRight.w, clouds.sunUp.w);
}

/** Coordenadas (m) de `p` no plano do mapa. */
fn cloud_shadow_plane(p: vec3f) -> vec2f {
    let rel = p - clouds.sunFrame.xyz;
    return vec2f(dot(rel, clouds.sunRight.xyz), dot(rel, clouds.sunUp.xyz));
}

/** O ponto do plano de coordenadas `x` (m). */
fn cloud_shadow_plane_point(x: vec2f) -> vec3f {
    return clouds.sunFrame.xyz + clouds.sunRight.xyz * x.x + clouds.sunUp.xyz * x.y;
}

/** Primeira página global da janela do nível `k`. */
fn cloud_shadow_window(k: u32) -> vec2i {
    let s = f32(CLOUD_SHADOW_PAGE) * cloud_shadow_texel_size(k);
    return vec2i(floor(cloud_shadow_camera() / s)) - vec2i(i32(CLOUD_SHADOW_PAGES / 2u));
}

/** A página física da página global `g` do nível `k`. */
fn cloud_shadow_slot(k: u32, g: vec2i) -> u32 {
    let n = i32(CLOUD_SHADOW_PAGES);
    let s = ((g % vec2i(n)) + vec2i(n)) % vec2i(n);
    return k * CLOUD_SHADOW_PAGES * CLOUD_SHADOW_PAGES + u32(s.y) * CLOUD_SHADOW_PAGES + u32(s.x);
}

/** Texel do canto da página física `slot` no atlas. */
fn cloud_shadow_slot_origin(slot: u32) -> vec2u {
    return vec2u(slot % CLOUD_SHADOW_SLOTS_X, slot / CLOUD_SHADOW_SLOTS_X) * CLOUD_SHADOW_STRIDE;
}

/** O nível de uma página física. */
fn cloud_shadow_slot_level(slot: u32) -> u32 {
    return slot / (CLOUD_SHADOW_PAGES * CLOUD_SHADOW_PAGES);
}

/** A página global que a janela do quadro põe na página física `slot`. */
fn cloud_shadow_slot_page(slot: u32) -> vec2i {
    let n = i32(CLOUD_SHADOW_PAGES);
    let k = cloud_shadow_slot_level(slot);
    let r = slot % (CLOUD_SHADOW_PAGES * CLOUD_SHADOW_PAGES);
    let s = vec2i(i32(r % CLOUD_SHADOW_PAGES), i32(r / CLOUD_SHADOW_PAGES));
    let w = cloud_shadow_window(k);
    return w + (((s - w) % vec2i(n)) + vec2i(n)) % vec2i(n);
}

/** Coordenadas (m) no plano do centro do texel `t` (0…16 por eixo, com a coluna da vizinha) da página `g` do nível `k`. */
fn cloud_shadow_texel_plane(k: u32, g: vec2i, t: vec2u) -> vec2f {
    let gt = g * i32(CLOUD_SHADOW_PAGE) + vec2i(t);
    return (vec2f(gt) + 0.5) * cloud_shadow_texel_size(k);
}

/** O mesmo pelo texel do plano de um sol com a razão `a` (a página desenhada com outro sol). */
fn cloud_shadow_texel_plane_aspect(k: u32, g: vec2i, t: vec2u, a: f32) -> vec2f {
    let gt = g * i32(CLOUD_SHADOW_PAGE) + vec2i(t);
    return (vec2f(gt) + 0.5) * cloud_shadow_texel_aspect(k, a);
}

/** O nível que cobre `x` (o menor, com a borda) e o peso do seguinte na faixa de mistura (os 30 % de fora). */
fn cloud_shadow_level(x: vec2f) -> vec2f {
    let c = abs(x - cloud_shadow_camera());
    let d = max(c.x, c.y / cloud_shadow_aspect(clouds.sunDir.xyz));
    let u0 = cloud_shadow_usable(0u);
    let last = f32(CLOUD_SHADOW_LEVELS - 1u);
    var k = 0.0;
    if (d > u0) { k = min(ceil(log2(d / u0)), last); }
    if (k >= last) { return vec2f(last, 0.0); }
    let r = d / cloud_shadow_usable(u32(k));
    return vec2f(k, smoothstep(0.7, 1.0, r));
}

/** Coordenadas (texels, contínuas) no atlas do ponto `x` do plano no nível `k` (preso à janela). */
fn cloud_shadow_atlas_texel(x: vec2f, k: u32) -> vec2f {
    let t = cloud_shadow_texel_size(k);
    let w = vec2f(cloud_shadow_window(k));
    let P = f32(CLOUD_SHADOW_PAGE);
    let N = f32(CLOUD_SHADOW_PAGES);
    let X = clamp(x / t, w * P + 0.5, (w + N) * P - 0.5);
    let g = clamp(floor((X - 0.5) / P), w, w + N - 1.0);
    let o = cloud_shadow_slot_origin(cloud_shadow_slot(k, vec2i(g)));
    return vec2f(o) + X - g * P;
}

/** Hash inteiro (Wang/PCG) de uma palavra. */
fn cloud_shadow_hash1(v: u32) -> u32 {
    var x = v;
    x ^= x >> 16u;
    x *= 0x7feb352du;
    x ^= x >> 15u;
    x *= 0x846ca68bu;
    x ^= x >> 16u;
    return x;
}

/** O texel (em ordem de linha) da prova `j` da página física `slot` no quadro `frame`. */
fn cloud_shadow_probe_texel(slot: u32, frame: u32, j: u32) -> u32 {
    return cloud_shadow_hash1((slot * CLOUD_SHADOW_PROBES + j) * 0x9e3779b1u + frame * 0x85ebca6bu)
        % CLOUD_SHADOW_PAGE_TEXELS;
}

/** A base do plano para o sol `s` (a rotação mínima de +y ao sol, contínua até o nadir): a direita e em cima. */
fn cloud_shadow_basis(s: vec3f) -> mat2x3f {
    let k = 1.0 / max(1.0 + s.y, 1e-6);
    let right = vec3f(s.y + s.z * s.z * k, -s.x, -s.x * s.z * k);
    return mat2x3f(right, cross(s, right));
}
