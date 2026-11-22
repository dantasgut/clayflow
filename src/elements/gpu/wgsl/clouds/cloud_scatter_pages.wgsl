// As páginas do cache de espalhamento das nuvens (spec 041, T023; R11 revisto; T074): as sondas da grade em páginas de
// `CLOUD_SCATTER_PAGE³` numa série por páginas de buffer (`cloud_scatter_cache`, palavras): primeiro as palavras
// globais (a geração da grade; o registro do panorama: o sol, a câmera, o tempo e a assinatura do último desenho dele;
// o centro da grade no referencial das nuvens com que o cache foi feito; as provas do panorama do quadro anterior),
// depois o registro de cada página (`CLOUD_SCATTER_H_*`: o sol, o quadro, a câmera, o tempo e a assinatura do último
// caminho, a geração, quantas sondas tinham nuvem e os caminhos efetivos da página) e então as sondas, oito palavras cada:
// a soma da parte do sol da luz dos caminhos por unidade da luz do sol que chega à sonda e a contagem; a soma da parte do
// céu por unidade da irradiância do céu (`cloud_scatter_main`). A página vale (as sondas dela) com o carimbo da série na
// época atual e a geração da grade de agora; senão, zero. O trabalho do quadro (`cloud_scatter_work`): a contagem, o
// panorama a refazer, se alguma página caminha, o transporte da grade de antes (o centro dela), a lista das páginas
// escolhidas (a página e o esquecimento) e a marca de cada página para o filtro.
// Requer: clouds, cloud_scatter_cache, cloud_scatter_stamps, cloud_scatter_clock.

const CLOUD_SCATTER_PAGE: u32 = 8u;
const CLOUD_SCATTER_PAGE_PROBES: u32 = 512u;
/** Palavras por sonda: a parte do sol (rgb) e a contagem, a parte do céu (rgb) e uma livre. */
const CLOUD_SCATTER_PROBE_WORDS: u32 = 8u;
const CLOUD_SCATTER_GLOBAL_WORDS: u32 = 224u;
const CLOUD_SCATTER_HEADER_WORDS: u32 = 16u;
// As palavras do registro de uma página.
const CLOUD_SCATTER_H_SUN: u32 = 0u;
const CLOUD_SCATTER_H_FRAME: u32 = 3u;
const CLOUD_SCATTER_H_GEN: u32 = 4u;
const CLOUD_SCATTER_H_CLOUDY: u32 = 5u;
const CLOUD_SCATTER_H_PATHS: u32 = 8u;
const CLOUD_SCATTER_H_EYE: u32 = 9u;
const CLOUD_SCATTER_H_TIME: u32 = 12u;
const CLOUD_SCATTER_H_SIGNATURE: u32 = 13u;
// As palavras globais: a geração da grade, o registro do panorama (o mesmo arranjo do de uma página, a partir de 1), o
// centro da grade no referencial das nuvens (x, z; f32) e as provas do panorama (a contagem e, a partir de
// `CLOUD_SCATTER_G_PROBES`, três palavras por prova: o texel, a luminância e a transmitância).
const CLOUD_SCATTER_G_GEN: u32 = 0u;
const CLOUD_SCATTER_G_PANORAMA: u32 = 1u;
const CLOUD_SCATTER_G_CENTER: u32 = 16u;
const CLOUD_SCATTER_G_PROBE_COUNT: u32 = 18u;
const CLOUD_SCATTER_G_PROBES: u32 = 32u;
/** Provas do panorama por quadro (três palavras cada nas globais). */
const CLOUD_SCATTER_PANORAMA_PROBES: u32 = 64u;
// As palavras do trabalho do quadro antes da lista: a contagem, o panorama a refazer, alguma página marcada no filtro, o
// transporte da grade de antes (1 no quadro em que o centro mudou) e o centro dela no mundo (x, z; f32).
const CLOUD_SCATTER_WORK_PANORAMA: u32 = 1u;
const CLOUD_SCATTER_WORK_ANY: u32 = 2u;
const CLOUD_SCATTER_WORK_CARRY: u32 = 3u;
const CLOUD_SCATTER_WORK_CARRY_CENTER: u32 = 4u;
/** A mudança medida do panorama no quadro e o porquê do desenho (1 a série, 2 o conteúdo, 4 a mudança): o registro. */
const CLOUD_SCATTER_WORK_PANORAMA_CHANGE: u32 = 6u;
/** O começo da lista das páginas escolhidas no trabalho do quadro. */
const CLOUD_SCATTER_WORK_LIST: u32 = 8u;
/** Invocações do grupo da escolha. */
const CLOUD_SCATTER_SELECT_GROUP: u32 = 256u;

/** Sondas por eixo da grade. */
fn clouds_scatter_size() -> vec3u {
    return clouds.scatterSize.xyz;
}

/** Páginas por eixo. */
fn cloud_scatter_pages_of(size: vec3u) -> vec3u {
    return (size + vec3u(CLOUD_SCATTER_PAGE - 1u)) / CLOUD_SCATTER_PAGE;
}

fn cloud_scatter_page_count(size: vec3u) -> u32 {
    let n = cloud_scatter_pages_of(size);
    return n.x * n.y * n.z;
}

/** A primeira sonda da página `p` (x mais rápido, depois a altitude, depois z). */
fn cloud_scatter_page_origin(p: u32, size: vec3u) -> vec3u {
    let n = cloud_scatter_pages_of(size);
    return vec3u(p % n.x, (p / n.x) % n.y, p / (n.x * n.y)) * CLOUD_SCATTER_PAGE;
}

/** A página e a posição na página da sonda `g`. */
fn cloud_scatter_page_of(g: vec3u, size: vec3u) -> vec2u {
    let n = cloud_scatter_pages_of(size);
    let pg = g / CLOUD_SCATTER_PAGE;
    let l = g % CLOUD_SCATTER_PAGE;
    return vec2u(
        pg.x + n.x * (pg.y + n.y * pg.z),
        l.x + CLOUD_SCATTER_PAGE * (l.y + CLOUD_SCATTER_PAGE * l.z),
    );
}

fn cloud_scatter_global(w: u32) -> u32 {
    return atomicLoad(&cloud_scatter_cache[w]);
}

fn cloud_scatter_set_global(w: u32, v: u32) {
    atomicStore(&cloud_scatter_cache[w], v);
}

fn cloud_scatter_header_word(p: u32, w: u32) -> u32 {
    return CLOUD_SCATTER_GLOBAL_WORDS + p * CLOUD_SCATTER_HEADER_WORDS + w;
}

fn cloud_scatter_header(p: u32, w: u32) -> u32 {
    return atomicLoad(&cloud_scatter_cache[cloud_scatter_header_word(p, w)]);
}

fn cloud_scatter_header_f(p: u32, w: u32) -> f32 {
    return bitcast<f32>(cloud_scatter_header(p, w));
}

fn cloud_scatter_set_header(p: u32, w: u32, v: u32) {
    atomicStore(&cloud_scatter_cache[cloud_scatter_header_word(p, w)], v);
}

fn cloud_scatter_set_header_f(p: u32, w: u32, v: f32) {
    cloud_scatter_set_header(p, w, bitcast<u32>(v));
}

/** A primeira palavra da sonda `l` da página `p`. */
fn cloud_scatter_probe_word(p: u32, l: u32) -> u32 {
    let pages = cloud_scatter_page_count(clouds_scatter_size());
    return CLOUD_SCATTER_GLOBAL_WORDS + pages * CLOUD_SCATTER_HEADER_WORDS
        + (p * CLOUD_SCATTER_PAGE_PROBES + l) * CLOUD_SCATTER_PROBE_WORDS;
}

/** Uma sonda: a parte do sol (rgb, a soma) e a contagem (a); a parte do céu (rgb; a livre). */
struct CloudScatterProbe {
    sun: vec4f,
    sky: vec4f,
}

fn cloud_scatter_word_vec4(w: u32) -> vec4f {
    return vec4f(
        bitcast<f32>(atomicLoad(&cloud_scatter_cache[w])),
        bitcast<f32>(atomicLoad(&cloud_scatter_cache[w + 1u])),
        bitcast<f32>(atomicLoad(&cloud_scatter_cache[w + 2u])),
        bitcast<f32>(atomicLoad(&cloud_scatter_cache[w + 3u])),
    );
}

fn cloud_scatter_load(w: u32) -> CloudScatterProbe {
    return CloudScatterProbe(cloud_scatter_word_vec4(w), cloud_scatter_word_vec4(w + 4u));
}

fn cloud_scatter_store(w: u32, v: CloudScatterProbe) {
    for (var c = 0u; c < 4u; c++) {
        atomicStore(&cloud_scatter_cache[w + c], bitcast<u32>(v.sun[c]));
        atomicStore(&cloud_scatter_cache[w + 4u + c], bitcast<u32>(v.sky[c]));
    }
}

/** As sondas da página `p` valem na geração `gen` (o carimbo da série na época atual e a mesma geração)? */
fn cloud_scatter_page_current(p: u32, gen: u32) -> bool {
    return cloud_scatter_stamps[p] == cloud_scatter_clock.x && cloud_scatter_header(p, 4u) == gen;
}

/** A palavra da marca do filtro da página `p` no trabalho do quadro. */
fn cloud_scatter_work_dirty(p: u32) -> u32 {
    return CLOUD_SCATTER_WORK_LIST + 2u * cloud_scatter_page_count(clouds_scatter_size()) + p;
}
