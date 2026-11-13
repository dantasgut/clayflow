// Película de água nos sólidos (spec 034): a água que toca um sólido deixa nele uma película mais fina que as
// partículas. Ela fica presa pela borda até o peso romper a linha de contato (Furmidge, com a histerese ampliada pela
// rugosidade), escorre pela gravidade ao longo do sólido — molhando o seco à frente e deixando para trás a espessura
// que a borda segura —, espalha-se no plano pela pressão (o peso da coluna e a de Laplace, a lubrificação de película
// fina), junta-se à que encontra, entra nos poros (Lucas–Washburn), evapora para o ar (Carrier) e, onde não tem mais
// sólido para descer (a quina, a face de baixo), pende até juntar o volume de uma partícula e pingar. Fica no buffer das
// consultas do campo (`field_data`), depois dos voxels (`fluid_field.film.x` palavras do início), numa tabela de hash
// própria que persiste entre os quadros pelo canal temporal — a da superfície do campo é refeita a cada um. A tabela é
// por páginas de 8 × 8 células no plano da superfície, numa camada (T066d): a página leva o eixo da normal dominante
// (`field_film_axes`) — a película mora em superfícies, e a página cúbica de 4³ só usava uma camada de quatro (a chuva
// num chão grande enchia a tabela das páginas e as que não cabiam sumiam em blocos). As células, na ordem das páginas, e
// depois a chave de cada página; a busca sonda a página e acha a célula direto nela (a leitura 3 × 3 e as vizinhas do
// passo caem quase sempre na mesma página). Toda busca vai com os eixos do plano da célula. A célula tem
// o lado da resolução do rastro (`fluid_field.filmShape.x`, uma fração do voxel do campo: o rastro de uma gota tem a largura do
// contato dela, não a do voxel). Por célula, `FIELD_FILM_WORDS` palavras: a chave (as coordenadas deslocadas + 1; 0
// vazia), a água livre (espessura em `FIELD_FILM_UNIT` m), a normal do sólido (snorm 8 × 4; entre as escritas do quadro
// fica a de maior palavra — a escolha não depende da ordem dos atômicos), a marca de submersa (a água
// do volume está ali: a célula não aparece como molhada, é a própria água), a água absorvida (em `FIELD_FILM_UNIT` m), a
// superfície (a entrada + 1 na tabela das superfícies do campo, `fluid_field.filmSurfaces`; 0 ainda não resolvida) e a
// água pendente (em `FIELD_FILM_DROP_UNITS` unidades da livre: a que não tem sólido por onde descer).
// Por quadro em que a simulação avança: `field_film_pressure_main`, `field_film_step_main` (por célula),
// `field_film_absorb_main` (por gota que desliza: a partícula passa à película), `field_film_drip_main` (por célula com
// água pendente: a película volta a ser partícula) e `field_film_deposit_main` (por partícula encostada num sólido).
// Quem sombreia lê a água livre e a saturação dos poros no ponto da superfície (`field_film_at`), quem refrata a
// inclinação da película (`field_film_slope`).
// Requer: fluid_field, field_common, FIELD_FILM_WORDS, FIELD_FILM_SURFACES.

/**
 * Espessura em ponto fixo, da água livre e da absorvida: unidade de 0,01 nm — a evaporação de um passo de 60 Hz (~0,7 nm
 * a 20 °C) fica com erro de arredondamento abaixo de 1 %; até 4 cm (a capacidade dos poros é limitada a isso).
 */
const FIELD_FILM_UNIT: f32 = 1.0e-11;
/** Película residual que a água deixa no sólido ao passar (m): ~0,1 mm, a da água que escorre de uma parede lisa. */
const FIELD_FILM_RESIDUAL: f32 = 1.0e-4;
/** Sondagens da tabela da película. */
const FIELD_FILM_PROBES: u32 = 32u;
/**
 * A água pendente em unidades de `FIELD_FILM_DROP_UNITS` unidades da água livre sobre a célula (a mesma conta inteira:
 * a passagem da livre à pendente e o pingo não arredondam volume) — com a célula de 6,25 mm, 0,4 nL a unidade e até
 * 1,7 L por célula.
 */
const FIELD_FILM_DROP_UNITS: u32 = 1024u;

/**
 * Água livre a partir da qual a célula não recebe pelo espalhamento nem a gota que desliza (m; no quadro anterior): 2 cm,
 * a escala das partículas — a água ali é a que elas resolvem. Recusar desde a película mais grossa do modelo empilhava a
 * água que cai sempre no mesmo lugar até passar do ponto fixo (4,3 cm).
 */
const FIELD_FILM_FULL: f32 = 0.02;
/** Água livre acima da qual a célula não recebe mais (m): a película já é uma gota, maior que o modelo de filme fino. */
const FIELD_FILM_MAX: f32 = 0.01;

/**
 * A fração da célula coberta pelo disco de raio `radius` cujo centro está a `distance` do centro dela (a borda do disco
 * como a reta que corta a célula). A deposição pesa a água por ela: a leitura suave das células dá a borda redonda do
 * disco, não a do conjunto das células inteiras que ele toca (T066d; `fields/reference/film.ts`).
 */
fn field_film_coverage(distance: f32, radius: f32) -> f32 {
    return clamp(0.5 + (radius - distance) / field_film_size(), 0.0, 1.0);
}

/**
 * A célula da película sobre o plano da superfície (normal `n`, pelo ponto `q`) na coluna `uv` dos eixos do plano
 * (`field_film_axes`, em células) e o ponto do plano no centro da coluna.
 */
struct FieldFilmPlaneCell {
    cell: vec3i,
    point: vec3f,
}

fn field_film_plane_cell(q: vec3f, n: vec3f, axes: vec2i, uv: vec2i) -> FieldFilmPlaneCell {
    let size = field_film_size();
    let k = 3 - axes.x - axes.y;
    var x = q;
    x[axes.x] = (f32(uv.x) + 0.5) * size;
    x[axes.y] = (f32(uv.y) + 0.5) * size;
    // A coordenada de fora do plano dos eixos: a do plano da superfície ali (a normal dominante não é nula).
    x[k] = q[k] - (n[axes.x] * (x[axes.x] - q[axes.x]) + n[axes.y] * (x[axes.y] - q[axes.y])) / n[k];
    return FieldFilmPlaneCell(field_film_cell(x, n), x);
}

/** As unidades da pendente de uma partícula (o pingo e a gota passada à película, a conta inversa). */
fn field_film_particle_units() -> u32 {
    let size = field_film_size();
    return u32(fluid_field.filmShape.z / (f32(FIELD_FILM_DROP_UNITS) * FIELD_FILM_UNIT * size * size) + 0.5);
}

/** Lado da célula da película (m): a resolução do rastro. */
fn field_film_size() -> f32 {
    return fluid_field.filmShape.x;
}

/** Primeira palavra da célula `slot` da película. */
fn field_film_word(slot: u32) -> u32 {
    return fluid_field.film.x + FIELD_FILM_WORDS * slot;
}

/**
 * Chave da célula `c` (coordenadas em células: x e z em [−1024, 1022], y em [−512, 511] — 11, 10 e 11 bits): 0 fora do
 * alcance (sem película ali).
 */
fn field_film_key(c: vec3i) -> u32 {
    if (c.x < -1024 || c.x > 1022 || c.z < -1024 || c.z > 1022 || c.y < -512 || c.y > 511) { return 0u; }
    let u = bitcast<vec3u>(c + vec3i(1024, 512, 1024));
    return ((u.x << 21u) | (u.y << 11u) | u.z) + 1u;
}

/** Coordenadas da célula de chave `key` (≠ 0). */
fn field_film_coords(key: u32) -> vec3i {
    let k = key - 1u;
    return vec3i(i32((k >> 21u) & 2047u), i32((k >> 11u) & 1023u), i32(k & 2047u)) - vec3i(1024, 512, 1024);
}

/** Célula da película num ponto da superfície de normal `n` (um quarto de célula para o lado de fora). */
fn field_film_cell(p: vec3f, n: vec3f) -> vec3i {
    let size = field_film_size();
    return vec3i(floor((p + n * (0.25 * size)) / size));
}

/** Os dois eixos do plano da célula de normal `n`: os que não são o da componente dominante dela. */
fn field_film_axes(n: vec3f) -> vec2i {
    let a = abs(n);
    if (a.x >= a.y && a.x >= a.z) { return vec2i(1, 2); }
    if (a.y >= a.z) { return vec2i(0, 2); }
    return vec2i(0, 1);
}

/**
 * Chave da página da célula `c` no plano dos eixos `axes` (≠ 0; as coordenadas já no alcance de `field_film_key`): o
 * eixo da normal (2 bits), o bloco de 8 × 8 no plano (8 bits cada) e a camada (11 bits).
 */
fn field_film_page_key(c: vec3i, axes: vec2i) -> u32 {
    let k = 3 - axes.x - axes.y;
    let pu = bitcast<u32>((c[axes.x] >> 3u) + 128);
    let pv = bitcast<u32>((c[axes.y] >> 3u) + 128);
    let layer = bitcast<u32>(c[k] + 1024);
    return ((u32(k) << 27u) | (pu << 19u) | (pv << 11u) | layer) + 1u;
}

/** Os eixos do plano da página de chave `key` (≠ 0): os de fora do eixo da normal que ela leva. */
fn field_film_key_axes(key: u32) -> vec2i {
    let k = ((key - 1u) >> 27u) & 3u;
    return select(select(vec2i(0, 1), vec2i(0, 2), k == 1u), vec2i(1, 2), k == 0u);
}

/** Máscara da tabela das páginas (as células por página são 64). */
fn field_film_page_mask() -> u32 {
    return fluid_field.film.y >> 6u;
}

/** Primeira palavra da tabela das páginas, a partir do começo da fatia (depois das células). */
fn field_film_pages_word() -> u32 {
    return FIELD_FILM_WORDS * (fluid_field.film.y + 1u);
}

/** Balde inicial da página de chave `key` (a sondagem segue com passo ímpar tirado da chave, como a tabela dos blocos). */
fn field_film_page_bucket(key: u32) -> u32 {
    return hash_cell(vec3u(key, key >> 11u, key >> 19u)) & field_film_page_mask();
}

/** Índice da célula `c` (no plano dos eixos `axes`) na página `page` da tabela. */
fn field_film_slot_in(page: u32, c: vec3i, axes: vec2i) -> u32 {
    return page * 64u + bitcast<u32>(c[axes.x] & 7) + 8u * bitcast<u32>(c[axes.y] & 7);
}

/** Linha `row` (0 ou 1) da entrada `surface` da tabela das superfícies (fora dela, o padrão). */
fn field_film_surface(surface: u32, row: u32) -> vec4f {
    return fluid_field.filmSurfaces[2u * select(0u, surface, surface < FIELD_FILM_SURFACES) + row];
}
