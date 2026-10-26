// Campo dos fluidos (spec 033, R11): constantes, a chave e o balde de um bloco na tabela, os índices dos voxels e as
// coordenadas. Blocos de 8³ voxels de ½ espaçamento de partícula, em coordenadas absolutas de mundo (o bloco b cobre
// [b · 8 · voxel, (b + 1) · 8 · voxel)); a chave empacota as três coordenadas em 10 bits cada (deslocadas de 512, +1 —
// 0 é o balde vazio). Os voxels do interior (`field_interior_at`) e os com 2 de borda de cada lado (`field_apron_at`,
// 12³: a amostra tricúbica cabe num bloco só). O que as consultas leem fica num buffer só de palavras de 32 bits
// (`FluidField.data`, uma ligação de storage): os limites (8 palavras, em ordem sem sinal), a tabela (chave e índice do
// bloco por balde), os blocos (coordenadas e corpo, 4 palavras) e os voxels com a borda (f32), nos deslocamentos de
// `fluid_field.limits.zw`.
// Requer: fluid_field (os parâmetros).

const FIELD_BRICK: i32 = 8;
const FIELD_APRON: i32 = 2;
const FIELD_STRIDE: i32 = 12;
const FIELD_BRICK_VOXELS: u32 = 512u;
const FIELD_APRON_VOXELS: u32 = 1728u;
const FIELD_EMPTY: u32 = 0u;
const FIELD_KEY_RANGE: i32 = 511;
const FIELD_HEADER_WORDS: u32 = 8u;
// Palavra do cabeçalho com o nível da superfície do quadro (f32): o volume do campo conserva o das partículas.
const FIELD_ISO_WORD: u32 = 7u;
// Ponto fixo do volume somado (voxels) e a correção do nível por quadro: nível × (volume / alvo)^ganho, nos limites.
const FIELD_VOLUME_ONE: f32 = 256.0;
const FIELD_ISO_GAIN: f32 = 1.4;
const FIELD_ISO_MIN: f32 = 0.15;
const FIELD_ISO_MAX: f32 = 0.6;
// Unidade do ponto fixo da densidade (somada por atômicos inteiros: a soma não depende da ordem).
const FIELD_DENSITY_ONE: f32 = 65536.0;

/** Tamanho do voxel (m). */
fn field_voxel() -> f32 {
    return fluid_field.grid.y;
}

/** Lado de um bloco (m). */
fn field_brick_size() -> f32 {
    return fluid_field.grid.y * f32(FIELD_BRICK);
}

/** Chave de um bloco (0 = fora do alcance da chave). */
fn field_key(b: vec3i) -> u32 {
    if (any(abs(b) > vec3i(FIELD_KEY_RANGE))) { return FIELD_EMPTY; }
    let u = vec3u(b + vec3i(512));
    return (u.x | (u.y << 10u) | (u.z << 20u)) + 1u;
}

/** Balde inicial de uma chave na tabela. */
fn field_bucket(b: vec3i) -> u32 {
    return hash_cell(bitcast<vec3u>(b)) & fluid_field.sizes.z;
}

/** Bloco que contém o ponto de mundo `p`. */
fn field_brick_of(p: vec3f) -> vec3i {
    return vec3i(floor(p / field_brick_size()));
}

/** Índice de um voxel do interior (0..7 em cada eixo) do bloco `brick`. */
fn field_interior_at(brick: u32, v: vec3i) -> u32 {
    return brick * FIELD_BRICK_VOXELS + u32(v.x + FIELD_BRICK * (v.y + FIELD_BRICK * v.z));
}

/** Índice de um voxel com borda (−2..9 em cada eixo) do bloco `brick`. */
fn field_apron_at(brick: u32, v: vec3i) -> u32 {
    let a = v + vec3i(FIELD_APRON);
    return brick * FIELD_APRON_VOXELS + u32(a.x + FIELD_STRIDE * (a.y + FIELD_STRIDE * a.z));
}

/** Palavra da chave do balde `slot` (o índice do bloco vem na seguinte). */
fn field_key_word(slot: u32) -> u32 {
    return FIELD_HEADER_WORDS + 2u * slot;
}

/** Superbloco (4³ blocos) que contém o bloco `b`: a tabela de superblocos ocupados deixa a marcha pular 4 blocos vazios
 * de uma vez. */
fn field_super_of(b: vec3i) -> vec3i {
    return b >> vec3u(2u);
}

/** Máscara da tabela de superblocos (¼ da dos blocos). */
fn field_super_mask() -> u32 {
    return (fluid_field.sizes.z + 1u) / 4u - 1u;
}

/** Palavra da chave do balde `slot` da tabela de superblocos (logo depois da dos blocos). */
fn field_super_word(slot: u32) -> u32 {
    return FIELD_HEADER_WORDS + 2u * (fluid_field.sizes.z + 1u) + slot;
}

/** Balde inicial de um superbloco. */
fn field_super_bucket(s: vec3i) -> u32 {
    return hash_cell(bitcast<vec3u>(s)) & field_super_mask();
}

/** Primeira palavra do bloco `brick` (x, y, z, corpo). */
fn field_brick_word(brick: u32) -> u32 {
    return fluid_field.limits.z + 4u * brick;
}

/** Palavra do voxel de índice `i` (de `field_apron_at`). */
fn field_voxel_word(i: u32) -> u32 {
    return fluid_field.limits.w + i;
}

/** Inteiro com sinal → sem sinal na mesma ordem (os limites por mínimo e máximo atômicos sem sinal). */
fn field_ordered(x: i32) -> u32 {
    return bitcast<u32>(x) ^ 0x80000000u;
}

fn field_unordered(u: u32) -> i32 {
    return bitcast<i32>(u ^ 0x80000000u);
}

/** Centro de mundo do voxel `v` (−2..9) do bloco de coordenadas `b`. */
fn field_voxel_center(b: vec3i, v: vec3i) -> vec3f {
    return (vec3f(b * FIELD_BRICK + v) + 0.5) * field_voxel();
}
