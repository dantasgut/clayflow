// Mapa de sombra virtual (spec 034, T060 — o padrão dos mapas de sombra virtuais): níveis em volta da câmera no plano
// da luz, cada um com o dobro do lado do anterior e N × N páginas de 128² texels, ancoradas no espaço da luz (a página
// global `g` do nível `k` cobre [g, g + 1) × lado da página). A tabela de páginas (`rgba32uint`, N × N·16: um texel por
// página, os níveis empilhados, endereço toroidal `g mod N`) guarda a página global que ocupa o texel, os estados, a
// idade e a página física no atlas, e a profundidade de referência `z0` em que a página foi desenhada. O atlas guarda
// cada página física com 1 texel de borda (130²): a filtragem da penumbra não atravessa para a vizinha.
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

/** Origem (texel) da página física `phys` no atlas, já dentro da borda. */
fn sv_atlas_origin(m: ShadowMatrix, phys: u32) -> vec2f {
    let a = m.atlasPages;
    return vec2f(f32((phys % a) * SV_STRIDE + 1u), f32((phys / a) * SV_STRIDE + 1u));
}

/** Profundidade guardada de `z` (espaço da luz) numa página de referência `z0`: [0, 1] na faixa ± `depthRange`. */
fn sv_depth(m: ShadowMatrix, z: f32, z0: f32) -> f32 {
    return (z - z0) / (2.0 * m.depthRange) + 0.5;
}

/** A entrada da tabela vale para a página global `g` e foi desenhada? */
fn sv_readable(e: vec4u, g: vec2i) -> bool {
    return (e.z & SV_RENDERED) != 0u && bitcast<i32>(e.x) == g.x && bitcast<i32>(e.y) == g.y;
}

/**
 * Visibilidade da luz num ponto de volume (a névoa: sem superfície, normal 0) pelo mapa virtual: os pontos do volume não
 * pedem páginas finas — a busca começa dois níveis abaixo do mais grosso (a reserva no frustum), mais fina que os
 * froxels —, uma amostra deslocada dentro do texel pela sequência do antisserrilhado (o filtro temporal do volume faz a
 * média). Fora dos níveis ou sem página, 1.
 */
fn shadow_virtual_volume(
    m: ShadowMatrix,
    table: texture_2d<u32>,
    atlas: texture_depth_2d,
    compare: sampler_comparison,
    world_pos: vec3f,
    bias_texels: f32,
) -> f32 {
    let levels = sv_levels(m);
    if (levels == 0u) { return 1.0; }
    let p = sv_light(m, world_pos);
    var k = max(sv_level(m, p.xy), max(levels, 3u) - 3u);
    // O lado da página do nível (dobra a cada nível) calculado uma vez.
    var page = sv_page_size(m, k);
    let n = i32(m.pagesPerLevel);
    for (var i = 0u; i < 3u; i++) {
        if (k >= levels) { break; }
        let t = page / SV_PAGE;
        let q = p.xy + m.texelJitter * t;
        let g = vec2i(floor(q / page));
        let r = g - (vec2i(floor(m.camera.xy / page)) - vec2i(n / 2));
        if (all(r >= vec2i(0)) && all(r < vec2i(n))) {
            let e = textureLoad(table, sv_slot(m, k, g), 0);
            if (sv_readable(e, g)) {
                let uv = (sv_atlas_origin(m, e.z & SV_PHYS_MASK) + (q - vec2f(g) * page) / t)
                    / f32(m.atlasPages * SV_STRIDE);
                let reference = clamp(sv_depth(m, p.z, bitcast<f32>(e.w)) - bias_texels * t / (2.0 * m.depthRange), 0.0, 0.99999);
                return textureSampleCompareLevel(atlas, compare, uv, reference);
            }
        }
        k++;
        page *= 2.0;
    }
    return 1.0;
}

/**
 * Visibilidade da luz no ponto `world_pos` (1 = iluminado) pelo mapa virtual: o nível do ponto, ou o primeiro mais
 * grosso com a página desenhada (a página nova ainda não desenhada usa a do nível de cima); a penumbra por PCF com
 * `samples` amostras (1, 4 ou 9: grade 1×1, 2×2 ou 3×3), girada por `m.kernelRotation` e deslocada dentro do texel por
 * `m.texelJitter` (a sequência do antisserrilhado: o acúmulo temporal faz a média); num volume (normal 0),
 * `shadow_virtual_volume`. Cada amostra acha a sua página (a
 * grade pode cruzar a borda da página); amostra em página não desenhada fica de fora da média. Os vieses em texels do
 * nível: a consulta sai do ponto pela normal `normal` (0 num volume) `normal_texels` texels, mais quanto mais rasante a
 * luz `light_dir` (unitária, do ponto para a luz), e compara com `bias_texels` texels de profundidade. Fora dos níveis,
 * 1. Laços com teto constante.
 */
fn shadow_virtual_visibility(
    m: ShadowMatrix,
    table: texture_2d<u32>,
    atlas: texture_depth_2d,
    compare: sampler_comparison,
    world_pos: vec3f,
    normal: vec3f,
    light_dir: vec3f,
    bias_texels: f32,
    normal_texels: f32,
    samples: u32,
) -> f32 {
    let levels = sv_levels(m);
    if (levels == 0u) { return 1.0; }
    if (all(normal == vec3f(0.0))) {
        return shadow_virtual_volume(m, table, atlas, compare, world_pos, bias_texels);
    }
    let q0 = sv_light(m, world_pos).xy;
    var k = sv_level(m, q0);
    var found = false;
    for (var i = 0u; i < SV_MAX_LEVELS; i++) {
        if (k >= levels) { break; }
        let g = sv_page_of(m, k, q0);
        if (sv_in_window(m, k, g) && sv_readable(textureLoad(table, sv_slot(m, k, g), 0), g)) {
            found = true;
            break;
        }
        k++;
    }
    if (!found) { return 1.0; }
    let t = sv_texel(m, k);
    let page = sv_page_size(m, k);
    let n_dot_l = clamp(dot(normal, light_dir), 0.0, 1.0);
    let sin_l = sqrt(max(1.0 - n_dot_l * n_dot_l, 0.0));
    let pl = sv_light(m, world_pos + normal * (normal_texels * t * (0.5 + sin_l)));
    let atlas_size = f32(m.atlasPages * SV_STRIDE);
    let r = m.kernelRotation;
    let turn = mat2x2f(r.x, r.y, -r.y, r.x);
    let side = select(select(1u, 2u, samples >= 4u), 3u, samples >= 9u);
    let half = 0.5 * f32(side - 1u);
    var sum = 0.0;
    var count = 0.0;
    for (var iy = 0u; iy < 3u; iy++) {
        if (iy >= side) { break; }
        for (var ix = 0u; ix < 3u; ix++) {
            if (ix >= side) { break; }
            let q = pl.xy + (turn * (vec2f(f32(ix), f32(iy)) - half) + m.texelJitter) * t;
            let g = sv_page_of(m, k, q);
            if (!sv_in_window(m, k, g)) { continue; }
            let e = textureLoad(table, sv_slot(m, k, g), 0);
            if (!sv_readable(e, g)) { continue; }
            let local = (q - vec2f(g) * page) / t;
            let uv = (sv_atlas_origin(m, e.z & SV_PHYS_MASK) + local) / atlas_size;
            let reference = clamp(sv_depth(m, pl.z, bitcast<f32>(e.w)) - bias_texels * t / (2.0 * m.depthRange), 0.0, 0.99999);
            sum += textureSampleCompareLevel(atlas, compare, uv, reference);
            count += 1.0;
        }
    }
    return select(1.0, sum / count, count > 0.0);
}
