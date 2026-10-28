// Película de água nos sólidos (spec 034): a água que toca um sólido deixa nele uma película mais fina que as
// partículas. Ela fica presa pela borda até o peso romper a linha de contato (Furmidge, com a histerese ampliada pela
// rugosidade), escorre pela gravidade ao longo do sólido — molhando o seco à frente e deixando para trás a espessura
// que a borda segura —, junta-se à que encontra, entra nos poros (Lucas–Washburn) e evapora para o ar (Carrier). Fica
// no buffer das consultas do campo (`field_data`), depois dos voxels (`fluid_field.film.x` palavras do início), numa
// tabela de hash própria que persiste entre os quadros — a da superfície do campo é refeita a cada um. Por célula (um
// voxel do campo, junto à superfície do sólido), `FIELD_FILM_WORDS` palavras: a chave (as coordenadas + 1; 0 vazia), a
// água livre (espessura em `FIELD_FILM_UNIT` m), a normal do sólido (snorm 8 × 4), a marca de submersa (a água do
// volume está ali: a célula não aparece como molhada, é a própria água), a água absorvida (em `FIELD_FILM_UNIT` m) e a
// superfície (a entrada + 1 na tabela das superfícies do campo, `fluid_field.filmSurfaces`; 0 ainda não resolvida).
// Por quadro em que a simulação avança: `field_film_step_main` (por célula) e `field_film_deposit_main` (por partícula
// encostada num sólido). Quem sombreia lê a água livre e a saturação dos poros no ponto da superfície
// (`field_film_at`).
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

/** Primeira palavra da célula `slot` da película. */
fn field_film_word(slot: u32) -> u32 {
    return fluid_field.film.x + FIELD_FILM_WORDS * slot;
}

/** Chave da célula `c` (coordenadas em voxels, ±511): 0 fora do alcance (sem película ali). */
fn field_film_key(c: vec3i) -> u32 {
    if (any(abs(c) > vec3i(511))) { return 0u; }
    let u = bitcast<vec3u>(c + vec3i(512));
    return ((u.x << 20u) | (u.y << 10u) | u.z) + 1u;
}

/** Coordenadas da célula de chave `key` (≠ 0). */
fn field_film_coords(key: u32) -> vec3i {
    let k = key - 1u;
    return vec3i(i32((k >> 20u) & 1023u), i32((k >> 10u) & 1023u), i32(k & 1023u)) - vec3i(512);
}

/** Célula da película num ponto da superfície de normal `n` (um quarto de voxel para o lado de fora). */
fn field_film_cell(p: vec3f, n: vec3f) -> vec3i {
    return vec3i(floor((p + n * (0.25 * field_voxel())) / field_voxel()));
}

/** Balde inicial da célula `c`. */
fn field_film_bucket(c: vec3i) -> u32 {
    return hash_cell(bitcast<vec3u>(c)) & fluid_field.film.y;
}

/** Linha `row` (0 ou 1) da entrada `surface` da tabela das superfícies (fora dela, o padrão). */
fn field_film_surface(surface: u32, row: u32) -> vec4f {
    return fluid_field.filmSurfaces[2u * select(0u, surface, surface < FIELD_FILM_SURFACES) + row];
}
