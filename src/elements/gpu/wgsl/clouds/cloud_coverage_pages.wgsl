// O mapa de cobertura em níveis em volta da câmera (spec 041, R21 rodada 19, T077): o endereçamento do atlas, comum ao
// desenho das páginas, à escolha do quadro e à leitura (`cloud_coverage_at`). Espelho de `reference/cloudCoverageLevels.ts`.
//
// Um mapa de recortes no plano horizontal do referencial do vento (os texels andam com as nuvens; R11 revisto):
// `clouds.coveragePages.w` níveis, o texel do nível `k` é `clouds.coverageOffset.z·2ᵏ`, e cada nível tem
// `CLOUD_COVERAGE_PAGES²` páginas de `CLOUD_COVERAGE_PAGE²` texels em volta da câmera (`clouds.coverageMap.xy`, no
// referencial do vento; a janela presa à página). Endereço toroidal (`g mod N`, como o mapa visto do sol e a tabela do
// mapa de sombra virtual da 034): o nível `k` é a camada `k` de uma textura em camadas de 512² texels, o texel global `i`
// no texel `i mod 512` — a leitura é uma amostra só com o endereço que se repete (o par do filtro bilinear do outro lado
// da costura é o vizinho no toro), sem conta de página. Todas as páginas da janela residentes, e a que entra na janela é
// desenhada no mesmo quadro.
//
// A passagem de um nível ao seguinte sem degrau e com uma leitura só: o nível `k` cobre o ponto até `CLOUD_COVERAGE_REACH`
// texels do centro da janela dele (Chebyshev; o par bilinear fica dentro dela), e o anel das páginas de fora da janela
// (`CLOUD_COVERAGE_BAND` texels) guarda o valor levado ao do nível seguinte — a bilinear dos texels dele, `smoothstep` até
// a borda. Na borda, o nível `k` vale o que o `k + 1` lê ali. A mistura fica no desenho (uma vez por página), não na
// leitura (com duas leituras na faixa de fora, a marcha e os caminhos do cache custavam ~0,3 ms a mais: medido).
// Requer: clouds.

/** Texels por lado do interior de uma página. */
const CLOUD_COVERAGE_PAGE: u32 = 16u;
/** Páginas por lado de um nível. */
const CLOUD_COVERAGE_PAGES: u32 = 32u;
/** Páginas físicas de um nível. */
const CLOUD_COVERAGE_LEVEL_SLOTS: u32 = 1024u;
/** Texels por lado de uma camada (a janela de um nível). */
const CLOUD_COVERAGE_SIDE: u32 = 512u;

/** Níveis do mapa. */
fn cloud_coverage_levels() -> u32 {
    return clouds.coveragePages.w;
}

/** Páginas físicas do mapa (as janelas de todos os níveis). */
fn cloud_coverage_slot_count() -> u32 {
    return cloud_coverage_levels() * CLOUD_COVERAGE_LEVEL_SLOTS;
}

/** Texel (m) do nível `k`. */
fn cloud_coverage_texel_size(k: u32) -> f32 {
    return clouds.coverageOffset.z * exp2(f32(k));
}

/** Alcance (texels, Chebyshev) do nível em volta do centro da janela dele: o par bilinear fica dentro dela. */
const CLOUD_COVERAGE_REACH: f32 = 255.0;
/** Largura (texels) do anel de fora que leva o valor ao do nível seguinte: só a fileira de páginas de fora. */
const CLOUD_COVERAGE_BAND: f32 = 15.0;

/**
 * Raio útil (m, Chebyshev) do nível `k` em volta da câmera, com qualquer janela: o centro dela é o canto da página da
 * câmera, a menos de uma página dela.
 */
fn cloud_coverage_usable(k: u32) -> f32 {
    return (CLOUD_COVERAGE_REACH - f32(CLOUD_COVERAGE_PAGE)) * cloud_coverage_texel_size(k);
}

/**
 * A página da câmera no nível `k`: a do nível 0 (`floor(câmera / página₀)`) deslocada `k` bits — a divisão inteira para
 * baixo, igual a `floor(câmera / páginaₖ)` sem um `floor` por nível.
 */
fn cloud_coverage_camera_page(k: u32) -> vec2i {
    let s = f32(CLOUD_COVERAGE_PAGE) * clouds.coverageOffset.z;
    return vec2i(floor(clouds.coverageMap.xy / s)) >> vec2u(k);
}

/** Primeira página global da janela do nível `k`. */
fn cloud_coverage_window(k: u32) -> vec2i {
    return cloud_coverage_camera_page(k) - vec2i(i32(CLOUD_COVERAGE_PAGES / 2u));
}

/** A página física da página global `g` do nível `k`. */
fn cloud_coverage_slot(k: u32, g: vec2i) -> u32 {
    let n = i32(CLOUD_COVERAGE_PAGES);
    let s = ((g % vec2i(n)) + vec2i(n)) % vec2i(n);
    return k * CLOUD_COVERAGE_LEVEL_SLOTS + u32(s.y) * CLOUD_COVERAGE_PAGES + u32(s.x);
}

/** O nível de uma página física. */
fn cloud_coverage_slot_level(slot: u32) -> u32 {
    return slot / CLOUD_COVERAGE_LEVEL_SLOTS;
}

/** A página global que a janela do quadro põe na página física `slot`. */
fn cloud_coverage_slot_page(slot: u32) -> vec2i {
    let n = i32(CLOUD_COVERAGE_PAGES);
    let k = cloud_coverage_slot_level(slot);
    let r = slot % CLOUD_COVERAGE_LEVEL_SLOTS;
    let s = vec2i(i32(r % CLOUD_COVERAGE_PAGES), i32(r / CLOUD_COVERAGE_PAGES));
    let w = cloud_coverage_window(k);
    return w + (((s - w) % vec2i(n)) + vec2i(n)) % vec2i(n);
}

/** O ponto (m, referencial do vento) do centro do texel `t` (0…15 por eixo) da página `g` do nível `k`. */
fn cloud_coverage_texel_point(k: u32, g: vec2i, t: vec2u) -> vec2f {
    let gt = g * i32(CLOUD_COVERAGE_PAGE) + vec2i(t);
    return (vec2f(gt) + 0.5) * cloud_coverage_texel_size(k);
}

/** O centro (texels globais) da janela do nível `k`: o canto da página da câmera. */
fn cloud_coverage_center(k: u32) -> vec2f {
    return vec2f(cloud_coverage_camera_page(k) * i32(CLOUD_COVERAGE_PAGE));
}

/** A distância (texels, Chebyshev) do ponto `w` (m) ao centro da janela do nível `k`. */
fn cloud_coverage_reach(w: vec2f, k: u32) -> f32 {
    let x = abs(w / cloud_coverage_texel_size(k) - cloud_coverage_center(k));
    return max(x.x, x.y);
}

/**
 * O nível que lê o ponto `w` (m, referencial do vento): o menor cuja janela o cobre até `CLOUD_COVERAGE_REACH`;
 * `cloud_coverage_levels()` fora do mapa. A estimativa pelo expoente da distância à câmera (`frexp`: o menor `k` com o raio
 * útil ≥ d, que sempre cobre) e o anterior, se a janela dele cobre.
 */
fn cloud_coverage_level(w: vec2f) -> u32 {
    let c = abs(w - clouds.coverageMap.xy);
    let q = max(c.x, c.y) / cloud_coverage_usable(0u);
    var k = 0u;
    if (q > 1.0) {
        let f = frexp(q);
        k = u32(select(f.exp, f.exp - 1, f.fract == 0.5));
    }
    let levels = cloud_coverage_levels();
    if (k > levels) { return levels; }
    if (k > 0u && cloud_coverage_reach(w, k - 1u) <= CLOUD_COVERAGE_REACH) { return k - 1u; }
    return k;
}

/** O peso do nível seguinte no texel do ponto `p` (m) do nível `k` (o anel de fora da janela; 0 no último nível). */
fn cloud_coverage_ring(p: vec2f, k: u32) -> f32 {
    if (k + 1u >= cloud_coverage_levels()) { return 0.0; }
    return smoothstep(CLOUD_COVERAGE_REACH - CLOUD_COVERAGE_BAND, CLOUD_COVERAGE_REACH, cloud_coverage_reach(p, k));
}

/** A página global `g` do nível `k` está no anel de fora da janela de primeira página `win`? */
fn cloud_coverage_in_ring(g: vec2i, win: vec2i) -> bool {
    let r = g - win;
    let last = i32(CLOUD_COVERAGE_PAGES) - 1;
    return r.x == 0 || r.y == 0 || r.x == last || r.y == last;
}

/** O texel da camada `k` do texel `t` (0…15 por eixo) da página `g` do nível `k` (o endereço toroidal). */
fn cloud_coverage_store_texel(g: vec2i, t: vec2u) -> vec2u {
    let n = i32(CLOUD_COVERAGE_SIDE);
    let gt = g * i32(CLOUD_COVERAGE_PAGE) + vec2i(t);
    return vec2u(((gt % vec2i(n)) + vec2i(n)) % vec2i(n));
}

/** A coordenada de amostra (o endereço que se repete) do ponto `w` na camada do nível `k`. */
fn cloud_coverage_uv(w: vec2f, k: u32) -> vec2f {
    return w / (f32(CLOUD_COVERAGE_SIDE) * cloud_coverage_texel_size(k));
}
