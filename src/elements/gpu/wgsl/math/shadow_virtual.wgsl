// Mapa de sombra virtual (spec 034, T060 — o padrão dos mapas de sombra virtuais): níveis em volta da câmera no plano
// da luz, cada um com o dobro do lado do anterior e N × N páginas de 128² texels, ancoradas no espaço da luz (a página
// global `g` do nível `k` cobre [g, g + 1) × lado da página). Sem texturas (T060h): o atlas é um buffer de palavras com a
// tabela de páginas no começo (4 palavras por página virtual, N × N·16 entradas, os níveis empilhados, endereço toroidal
// `g mod N`: a página global que ocupa a entrada, os estados, a idade e a página física, e a profundidade de referência
// `z0` em que a página foi desenhada) e as páginas físicas depois, cada uma com 1 texel de borda (130² profundidades em
// bits de `f32`, linha a linha): a filtragem da penumbra não atravessa para a vizinha.
// Requer: struct ShadowMatrix.

const SV_PAGE: f32 = 128.0;
const SV_STRIDE: u32 = 130u;
const SV_MAX_LEVELS: u32 = 16u;
/** Estados da página na tabela (palavra z): alocada (tem página física) e desenhada (pode ser lida). */
const SV_ALLOCATED: u32 = 0x80000000u;
const SV_RENDERED: u32 = 0x40000000u;
const SV_PHYS_MASK: u32 = 0xFFFFu;
const SV_AGE_SHIFT: u32 = 16u;
const SV_AGE_MASK: u32 = 0xFFu;

/** Meio lado do nível `k` (m). */
fn sv_radius(m: ShadowMatrix, k: u32) -> f32 {
    return m.firstLevelRadius * exp2(f32(k));
}

/** Lado de uma página do nível `k` (m). */
fn sv_page_size(m: ShadowMatrix, k: u32) -> f32 {
    return 2.0 * sv_radius(m, k) / f32(m.pagesPerLevel);
}

/** Lado de um texel do nível `k` (m). */
fn sv_texel(m: ShadowMatrix, k: u32) -> f32 {
    return sv_page_size(m, k) / SV_PAGE;
}

/** Ponto do mundo no espaço da luz: x, y no plano da luz; z ao longo da direção da luz (maior = mais longe dela). */
fn sv_light(m: ShadowMatrix, p: vec3f) -> vec3f {
    return (m.lightView * vec4f(p, 1.0)).xyz;
}

/** Níveis ativos no quadro. */
fn sv_levels(m: ShadowMatrix) -> u32 {
    return u32(m.camera.w);
}

/** Primeira página global da janela do nível `k` (a câmera no centro, presa à página). */
fn sv_window(m: ShadowMatrix, k: u32) -> vec2i {
    let c = vec2i(floor(m.camera.xy / sv_page_size(m, k)));
    return c - vec2i(i32(m.pagesPerLevel / 2u));
}

/** A página global `g` está na janela do nível `k`? */
fn sv_in_window(m: ShadowMatrix, k: u32, g: vec2i) -> bool {
    let r = g - sv_window(m, k);
    let n = i32(m.pagesPerLevel);
    return all(r >= vec2i(0)) && all(r < vec2i(n));
}

/** Texel da página global `g` do nível `k` na tabela (e nos pedidos): endereço toroidal. */
fn sv_slot(m: ShadowMatrix, k: u32, g: vec2i) -> vec2u {
    let n = i32(m.pagesPerLevel);
    let s = ((g % vec2i(n)) + vec2i(n)) % vec2i(n);
    return vec2u(u32(s.x), u32(s.y) + k * m.pagesPerLevel);
}

/** Página global do nível `k` que contém o ponto `q` do plano da luz. */
fn sv_page_of(m: ShadowMatrix, k: u32, q: vec2f) -> vec2i {
    return vec2i(floor(q / sv_page_size(m, k)));
}

/**
 * Nível do ponto `q` do plano da luz: o menor cujo lado útil (o meio lado menos duas páginas — a janela presa à página e
 * a borda da penumbra) o contém, pela distância de Chebyshev à câmera; além do último, o último.
 */
fn sv_level(m: ShadowMatrix, q: vec2f) -> u32 {
    let d = max(abs(q.x - m.camera.x), abs(q.y - m.camera.y));
    let usable = m.firstLevelRadius * (1.0 - 4.0 / f32(m.pagesPerLevel));
    let k = ceil(log2(max(d / usable, 1.0)));
    return u32(clamp(k, 0.0, f32(max(sv_levels(m), 1u) - 1u)));
}

/** Primeira palavra da entrada `slot` (de `sv_slot`) da tabela, no começo do atlas. */
fn sv_table_word(m: ShadowMatrix, slot: vec2u) -> u32 {
    return (slot.y * m.pagesPerLevel + slot.x) * 4u;
}

/** Palavra do pedido da entrada `slot` (de `sv_slot`) no buffer dos pedidos. */
fn sv_request_word(m: ShadowMatrix, slot: vec2u) -> u32 {
    return slot.y * m.pagesPerLevel + slot.x;
}

/** Primeira palavra das páginas físicas no atlas, depois da tabela (todos os níveis reservados). */
fn sv_pages_base(m: ShadowMatrix) -> u32 {
    return SV_MAX_LEVELS * m.pagesPerLevel * m.pagesPerLevel * 4u;
}

/** Palavra do texel `t` (0..129, com a borda) da página física `phys` no atlas. */
fn sv_page_word(m: ShadowMatrix, phys: u32, t: vec2u) -> u32 {
    return sv_pages_base(m) + phys * SV_STRIDE * SV_STRIDE + t.y * SV_STRIDE + t.x;
}

/** Profundidade guardada de `z` (espaço da luz) numa página de referência `z0`: [0, 1] na faixa ± `depthRange`. */
fn sv_depth(m: ShadowMatrix, z: f32, z0: f32) -> f32 {
    return (z - z0) / (2.0 * m.depthRange) + 0.5;
}

/** A entrada da tabela vale para a página global `g` e foi desenhada? */
fn sv_readable(e: vec4u, g: vec2i) -> bool {
    return (e.z & SV_RENDERED) != 0u && bitcast<i32>(e.x) == g.x && bitcast<i32>(e.y) == g.y;
}
