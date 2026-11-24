// Mapa de sombra virtual (spec 034, T060 — o padrão dos mapas de sombra virtuais): níveis em volta da câmera no plano
// da luz, cada um com o dobro do lado do anterior e N × N páginas de 128² texels, ancoradas no espaço da luz (a página
// global `g` do nível `k` cobre [g, g + 1) × lado da página). Sem texturas (T060h): o atlas é um buffer de palavras com a
// tabela de páginas no começo (4 palavras por página virtual, N × N·16 entradas, os níveis empilhados, endereço toroidal
// `g mod N`: a página global que ocupa a entrada, os estados, a idade e a página física, e a profundidade de referência
// `z0` em que a página foi desenhada) e as páginas físicas depois, cada uma com 1 texel de borda (130² profundidades em
// bits de `f32`, linha a linha): a filtragem da penumbra não atravessa para a vizinha.
// O atlas é um só para todas as vistas de sombra da cena (spec 013): cada vista (um referencial, `ShadowMatrix`) tem a
// sua faixa da tabela (a partir de `m.tableBase`) e dos pedidos (`m.requestBase`); as páginas físicas, comuns, começam
// em `m.pagesBase`. Toda leitura do atlas passa por `sv_table_word` e `sv_page_word`, com a base da vista.
// Dois tipos de vista (`m.kind`; spec 013, R4). A ortográfica (0, a luz direcional): o plano da luz em metros, os níveis
// em volta da câmera, cada um com o dobro do lado do anterior. A em perspectiva (1, a luz de foco e cada face do cubo da
// pontual): a origem na luz (`m.origin.xyz`), o plano da vista em coordenadas do tronco — q = (x, y) / (z · tan), o
// tronco é o quadrado [−1, 1]², `m.origin.w` a tangente do meio ângulo —, a profundidade linear z ao longo do eixo, e os
// níveis como níveis de resolução do mesmo tronco (o nível k tem páginas de lado 2 · 2ᵏ / N, em volta do centro): o
// nível de um ponto sai do tamanho do pixel da câmera nele (`sv_level_at`). As mesmas funções servem aos dois: o que é
// medido no plano da vista (páginas, texels) converte-se em metros por `sv_metres`.
// Requer: struct ShadowMatrix.

const SV_PAGE: f32 = 128.0;
const SV_STRIDE: u32 = 130u;
const SV_MAX_LEVELS: u32 = 16u;
/** Vistas de sombra no máximo: o teto dos laços que as percorrem (`SHADOW_MAX_VIEWS`). */
const SV_MAX_VIEWS: u32 = 16u;
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

/** O maior meio ângulo de uma vista em perspectiva (rad): além dele a tangente não cabe no mapa. */
const SV_CONE_MAX: f32 = 1.4;
/** Coordenada do plano de um ponto atrás da origem de uma vista em perspectiva: fora de qualquer janela. */
const SV_BEHIND: f32 = 1.0e6;

/**
 * O referencial de uma vista de eixo `dir` (unitário) com a origem em `origin` (mundo → vista: as linhas são os eixos
 * x e y do plano e o eixo da vista; o "para cima" trocado no eixo quase vertical). Na luz direcional a origem é a do
 * mundo (a âncora das páginas).
 */
fn sv_frame(dir: vec3f, origin: vec3f) -> mat4x4f {
    let up = select(vec3f(0.0, 1.0, 0.0), vec3f(0.0, 0.0, 1.0), abs(dir.y) > 0.99);
    let x = normalize(cross(up, dir));
    let y = cross(dir, x);
    return mat4x4f(
        vec4f(x.x, y.x, dir.x, 0.0),
        vec4f(x.y, y.y, dir.y, 0.0),
        vec4f(x.z, y.z, dir.z, 0.0),
        vec4f(-dot(x, origin), -dot(y, origin), -dot(dir, origin), 1.0),
    );
}

/** Ponto do mundo no referencial da vista (metros): x, y nos eixos do plano, z ao longo do eixo. */
fn sv_view(m: ShadowMatrix, p: vec3f) -> vec3f {
    return (m.lightView * vec4f(p, 1.0)).xyz;
}

/**
 * Ponto do mundo no espaço da luz: x, y no plano da vista; z ao longo do eixo dela (maior = mais longe da luz). Na
 * vista em perspectiva, x e y nas coordenadas do tronco; atrás da origem, fora de qualquer janela.
 */
fn sv_light(m: ShadowMatrix, p: vec3f) -> vec3f {
    let v = sv_view(m, p);
    if (m.kind == 0u) { return v; }
    if (v.z <= 0.0) { return vec3f(SV_BEHIND, SV_BEHIND, v.z); }
    return vec3f(v.xy / (v.z * m.origin.w), v.z);
}

/** Metros por unidade do plano da vista à profundidade `z`: 1 na ortográfica; z · tan na em perspectiva. */
fn sv_metres(m: ShadowMatrix, z: f32) -> f32 {
    return select(1.0, max(z, 0.0) * m.origin.w, m.kind == 1u);
}

/** A face do cubo da direção `d`: a do eixo de maior módulo — 0 +x, 1 −x, 2 +y, 3 −y, 4 +z, 5 −z. */
fn sv_cube_face(d: vec3f) -> u32 {
    let a = abs(d);
    if (a.x >= a.y && a.x >= a.z) { return select(1u, 0u, d.x >= 0.0); }
    if (a.y >= a.z) { return select(3u, 2u, d.y >= 0.0); }
    return select(5u, 4u, d.z >= 0.0);
}

/** O eixo da face `face` do cubo. */
fn sv_cube_axis(face: u32) -> vec3f {
    let s = select(-1.0, 1.0, (face & 1u) == 0u);
    let a = face >> 1u;
    return vec3f(select(0.0, s, a == 0u), select(0.0, s, a == 1u), select(0.0, s, a == 2u));
}

/**
 * A vista `face` de um referencial de várias vistas (a pontual: as seis faces do cubo em volta da origem, 90° de
 * abertura cada): o referencial da face e a faixa dela no atlas (as faixas das vistas de um mapa são seguidas). No
 * referencial de uma vista só, ele mesmo.
 */
fn sv_face(m: ShadowMatrix, face: u32) -> ShadowMatrix {
    if (m.views <= 1u) { return m; }
    var f = m;
    f.lightView = sv_frame(sv_cube_axis(face), m.origin.xyz);
    f.tableBase = m.tableBase + face * m.stripWords;
    f.requestBase = m.requestBase + face * (m.stripWords / 2u);
    return f;
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

/**
 * A página global `g` está na janela do nível `k`? Na vista em perspectiva, também dentro do tronco (a página toca o
 * quadrado [−1, 1]²): as de fora não existem.
 */
fn sv_in_window(m: ShadowMatrix, k: u32, g: vec2i) -> bool {
    let r = g - sv_window(m, k);
    let n = i32(m.pagesPerLevel);
    if (!(all(r >= vec2i(0)) && all(r < vec2i(n)))) { return false; }
    if (m.kind == 0u) { return true; }
    let p = sv_page_size(m, k);
    return all(vec2f(g) * p < vec2f(1.0)) && all(vec2f(g + vec2i(1)) * p > vec2f(-1.0));
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

/**
 * Nível do ponto do mundo `world` (`l` = `sv_light` dele). Na vista ortográfica, `sv_level`. Na em perspectiva, pela
 * resolução na tela: o mais fino cujo texel, no ponto, não é menor que o pixel da câmera lá (`m.eye`: a posição da
 * câmera e, em w, o tamanho do pixel da câmera ortográfica; `m.pixel`: o ângulo de um pixel da câmera em perspectiva) —
 * o texel da sombra perto do pixel da tela.
 */
fn sv_level_at(m: ShadowMatrix, world: vec3f, l: vec3f) -> u32 {
    if (m.kind == 0u) { return sv_level(m, l.xy); }
    let footprint = m.eye.w + distance(world, m.eye.xyz) * m.pixel;
    let texel = sv_texel(m, 0u) * sv_metres(m, l.z);
    let k = floor(log2(max(footprint / max(texel, 1.0e-12), 1.0)));
    return u32(clamp(k, 0.0, f32(max(sv_levels(m), 1u) - 1u)));
}

/** Primeira palavra da entrada `slot` (de `sv_slot`) da tabela da vista, na faixa dela no atlas. */
fn sv_table_word(m: ShadowMatrix, slot: vec2u) -> u32 {
    return m.tableBase + (slot.y * m.pagesPerLevel + slot.x) * 4u;
}

/**
 * Primeira palavra do pedido da entrada `slot` (de `sv_slot`) na faixa da vista no buffer dos pedidos — duas por página virtual: a menor
 * e a maior profundidade (espaço da luz, na ordem de `sv_order`) dos pontos que a pediram; sem pedido, a maior é 0. Com
 * a faixa de profundidade, o pedido de um quadro vale no referencial de outro (a luz que mudou de direção): a página
 * pedida é um prisma do mundo, não só um retângulo do plano da luz.
 */
fn sv_request_word(m: ShadowMatrix, slot: vec2u) -> u32 {
    return m.requestBase + (slot.y * m.pagesPerLevel + slot.x) * 2u;
}

/** O `f32` em `u32` na mesma ordem (o mínimo e o máximo atômicos dos inteiros valem para os reais); nunca 0 num finito. */
fn sv_order(f: f32) -> u32 {
    let b = bitcast<u32>(f);
    return select(b | 0x80000000u, ~b, (b & 0x80000000u) != 0u);
}

fn sv_unorder(u: u32) -> f32 {
    return bitcast<f32>(select(~u, u & 0x7FFFFFFFu, (u & 0x80000000u) != 0u));
}

/** Primeira palavra das páginas físicas no atlas, depois das tabelas de todas as vistas (a mesma em toda vista). */
fn sv_pages_base(m: ShadowMatrix) -> u32 {
    return m.pagesBase;
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
