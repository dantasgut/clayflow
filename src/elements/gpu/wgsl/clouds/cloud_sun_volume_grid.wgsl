// A grade do volume de τ até o sol perto da câmera (spec 041, T074): nós no referencial das nuvens (o plano a partir do
// deslocamento do vento `clouds.coverageOffset.xy`; a altura da base ao topo da casca em `CLOUD_SUN_VOLUME_PAGES.y ·
// CLOUD_SUN_VOLUME_PAGE` células), em `CLOUD_SUN_VOLUME_LEVELS` níveis — o nível `k` com células de `clouds.sunVolume.x ·
// 2^k` m no plano e a janela de `CLOUD_SUN_VOLUME_PAGES` páginas de `CLOUD_SUN_VOLUME_PAGE³` células em volta da câmera;
// no plano, o endereço toroidal: a página global `g` mora no lugar físico `g mod páginas`, e a janela que anda com a
// câmera só refaz as que entram. Cada página física guarda `CLOUD_SUN_VOLUME_STRIDE³` nós (as células e o nó da vizinha
// em +x, +y e +z: a leitura filtra dentro dela), os níveis um depois do outro em z no atlas. O trabalho do quadro
// (`cloud_sun_volume_work`): a contagem, as filas, a lista das páginas escolhidas, as marcas de validade das duas partes
// (o cone e o resto) e a fila de cada página. Espelho de `reference/cloudSunVolume.ts`.
// Requer: cloud_common, clouds.

const CLOUD_SUN_VOLUME_PAGE: u32 = 8u;
const CLOUD_SUN_VOLUME_STRIDE: u32 = 9u;
const CLOUD_SUN_VOLUME_PAGES: vec3u = vec3u(20u, 8u, 20u);
const CLOUD_SUN_VOLUME_LEVELS: u32 = 5u;
const CLOUD_SUN_VOLUME_LEVEL_PAGES: u32 = 3200u;
const CLOUD_SUN_VOLUME_PAGE_COUNT: u32 = 16000u;
/** Lugares da lista das páginas do quadro (o orçamento no uniforme fica abaixo). */
const CLOUD_SUN_VOLUME_LIST: u32 = 128u;
// As palavras do trabalho do quadro (`CLOUD_SUN_VOLUME_WORK_*` de `schemas.ts`).
const CLOUD_SUN_VOLUME_WORK_HIST: u32 = 4u;
const CLOUD_SUN_VOLUME_WORK_LIST: u32 = 36u;
const CLOUD_SUN_VOLUME_WORK_VALID: u32 = 164u;
const CLOUD_SUN_VOLUME_VALID_WORDS: u32 = 500u;
const CLOUD_SUN_VOLUME_WORK_KEYS: u32 = 1164u;

/** O volume está ligado (a casca fina o bastante e sem o tempo: `clouds.sunVolume.x` > 0). */
fn cloud_sun_volume_on() -> bool {
    return clouds.sunVolume.x > 0.0;
}

/** O lado (m) da célula na altura (igual em todos os níveis). */
fn cloud_sun_volume_spacing() -> f32 {
    return clouds.shell.w / f32(CLOUD_SUN_VOLUME_PAGES.y * CLOUD_SUN_VOLUME_PAGE);
}

/** O lado (m) da célula no plano do nível `k`. */
fn cloud_sun_volume_cell(k: u32) -> f32 {
    return clouds.sunVolume.x * f32(1u << k);
}

/** A página global (x, z) da câmera no nível `k` (a do nível 0 no uniforme; cada nível, a metade, por baixo). */
fn cloud_sun_volume_camera(k: u32) -> vec2i {
    return bitcast<vec2i>(clouds.sunVolumeGrid.xy) >> vec2u(k);
}

/** A primeira página global da janela do nível `k` (x, z). */
fn cloud_sun_volume_window_start(k: u32) -> vec2i {
    return cloud_sun_volume_camera(k) - vec2i(CLOUD_SUN_VOLUME_PAGES.xz / 2u);
}

/** O lugar físico da página global `g` num eixo de `pages` páginas (o endereço toroidal). */
fn cloud_sun_volume_wrap(g: i32, pages: u32) -> u32 {
    let n = i32(pages);
    return u32(((g % n) + n) % n);
}

/** O índice da página física `p` do nível `k` (x mais rápido, depois a camada, depois z, depois o nível). */
fn cloud_sun_volume_slot(k: u32, p: vec3u) -> u32 {
    return k * CLOUD_SUN_VOLUME_LEVEL_PAGES + p.x + CLOUD_SUN_VOLUME_PAGES.x * (p.y + CLOUD_SUN_VOLUME_PAGES.y * p.z);
}

/** O nível do índice `slot`. */
fn cloud_sun_volume_slot_level(slot: u32) -> u32 {
    return slot / CLOUD_SUN_VOLUME_LEVEL_PAGES;
}

/** A página física (no nível) do índice `slot`. */
fn cloud_sun_volume_slot_page(slot: u32) -> vec3u {
    let n = CLOUD_SUN_VOLUME_PAGES;
    let s = slot % CLOUD_SUN_VOLUME_LEVEL_PAGES;
    return vec3u(s % n.x, (s / n.x) % n.y, s / (n.x * n.y));
}

/** O primeiro nó (texel) da página física `p` do nível `k` no atlas (os níveis um depois do outro em z). */
fn cloud_sun_volume_atlas(k: u32, p: vec3u) -> vec3u {
    return (p + vec3u(0u, 0u, k * CLOUD_SUN_VOLUME_PAGES.z)) * CLOUD_SUN_VOLUME_STRIDE;
}

/** A página global (x, camada, z) que a janela de agora do nível `k` põe no lugar físico `p`. */
fn cloud_sun_volume_global(k: u32, p: vec3u) -> vec3i {
    let s = cloud_sun_volume_window_start(k);
    return vec3i(
        s.x + i32(cloud_sun_volume_wrap(i32(p.x) - s.x, CLOUD_SUN_VOLUME_PAGES.x)),
        i32(p.y),
        s.y + i32(cloud_sun_volume_wrap(i32(p.z) - s.y, CLOUD_SUN_VOLUME_PAGES.z)),
    );
}

/** O ponto de mundo do nó global `n` do nível `k` (a altura pela sagita, como a grade do cache de espalhamento). */
fn cloud_sun_volume_node(k: u32, n: vec3i) -> vec3f {
    let xz = clouds.coverageOffset.xy + vec2f(f32(n.x), f32(n.z)) * cloud_sun_volume_cell(k);
    let alt = clouds.shell.y + f32(n.y) * cloud_sun_volume_spacing();
    let y = alt - dot(xz, xz) / (2.0 * (clouds.shell.x + alt));
    return vec3f(xz.x, y, xz.y);
}
