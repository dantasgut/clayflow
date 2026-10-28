// Cáusticas por fótons (spec 034, T067c; antes da GI, spec 033 US5): o hash espacial em mundo onde os fótons que
// passaram por superfícies especulares ou transmissivas (vidro, água, metal polido) depositam a luz na primeira difusa.
// Em níveis de células (`CAUSTICS_LEVELS`): o nível l tem lado `caustics.extra.x` × 2^l, e cada fóton deposita em
// todos — quem lê usa o mais fino com fótons bastantes (`CAUSTICS_MIN_PHOTONS` acumulados na média móvel), a estimativa de
// densidade adaptativa: onde chegam poucos fótons (a água espalhada por uma área grande) a cáustica fica mais suave em
// vez de manchas e pontos de fótons soltos, e afina quando chegam mais. Cada balde: a chave (as coordenadas da célula,
// 10 bits cada, deslocadas de 512, e o nível nos 2 bits de cima, +1 — 0 vazio), a soma do quadro em ponto fixo com sinal (rgb, a
// vazão de cada fóton, negativa na parcela da variável de controle: todos levam a mesma potência, as fontes escolhidas pela potência), a irradiância acumulada (rgb,
// f32), os fótons do quadro (ponto fixo, os pesos da tenda) e os acumulados (f32). O cabeçalho: a potência por fóton do quadro (f32), os
// baldes ocupados no quadro anterior e a soma do quadro, e as amostras da emissão na caixa dos volumes. Depósito e leitura pela tenda 2D no plano tangente
// (`caustics_tent`, spec 034 T057): uma camada de células ao longo da normal e a interpolação bilinear nos dois eixos
// tangentes — a irradiância é por área da superfície (a trilinear em 3D repartia o fóton entre as duas camadas em volta
// do chão e a leitura devolvia a metade).
// Requer: caustics (os baldes em `caustics.counts.y`), hash_cell.

const CAUSTICS_HEADER: u32 = 8u;
// Palavras do cabeçalho com as amostras na caixa dos volumes no quadro e as aceitas (u32), e a fração aceita (f32).
const CAUSTICS_TRIES: u32 = 3u;
const CAUSTICS_ACCEPTED: u32 = 4u;
const CAUSTICS_ACCEPTED_RATIO: u32 = 5u;
const CAUSTICS_WORDS: u32 = 10u;
/** Níveis de células (lados de 1, 2, 4 e 8 vezes o da célula fina). */
const CAUSTICS_LEVELS: u32 = 4u;
/** Peso do acumulado na média móvel de cada quadro (~39 quadros efetivos: (1 + h) / (1 − h)). */
const CAUSTICS_HYSTERESIS: f32 = 0.95;
/**
 * Fótons acumulados a partir dos quais um nível vale na leitura (cada fóton leva os três canais): os do quadro na média
 * móvel vezes os quadros efetivos dela — ~12 % de ruído na célula.
 */
const CAUSTICS_MIN_PHOTONS: f32 = 64.0;
// Unidade do ponto fixo das somas (com sinal): até 2²⁰ fótons inteiros numa célula sem estourar o i32 (o foco do vidro concentra
// boa parte dos fótons do quadro em poucas células).
const CAUSTICS_ONE: f32 = 2048.0;
const CAUSTICS_EMPTY: u32 = 0u;
const CAUSTICS_PROBES: u32 = 32u;

/** Baldes do hash (o resto do buffer depois do cabeçalho). */
fn caustics_slots() -> u32 {
    return max(caustics.counts.y, 1u);
}

/** Chave da célula `c` do nível `level` (0 fora do alcance). */
fn caustics_key(c: vec3i, level: u32) -> u32 {
    if (any(abs(c) > vec3i(511))) { return CAUSTICS_EMPTY; }
    let u = vec3u(c + vec3i(512));
    return (u.x | (u.y << 10u) | (u.z << 20u) | (level << 30u)) + 1u;
}

/** O nível da chave `key` (≠ 0). */
fn caustics_key_level(key: u32) -> u32 {
    return (key - 1u) >> 30u;
}

/** Balde inicial da célula `c` do nível `level`. */
fn caustics_bucket(c: vec3i, level: u32) -> u32 {
    return hash_cell(bitcast<vec3u>(c) ^ vec3u(level * 0x9E3779B9u)) % caustics_slots();
}

/** Lado das células do nível `level` (m). */
fn caustics_cell_size(level: u32) -> f32 {
    return caustics.extra.x * f32(1u << level);
}

/** Primeira palavra do balde `slot`. */
fn caustics_word(slot: u32) -> u32 {
    return CAUSTICS_HEADER + slot * CAUSTICS_WORDS;
}


/**
 * A tenda 2D no plano tangente do ponto `p` de normal `n` no nível `level`: o eixo dominante da normal escolhe a camada (a célula meio
 * passo para fora da superfície, firme quando o ponto cai na fronteira entre duas) e, nos outros dois eixos (`u`, `v`),
 * a célula de base e as frações da interpolação bilinear.
 */
struct CausticsTent {
    base: vec3i,
    f: vec2f,
    u: u32,
    v: u32,
}

fn caustics_tent(p: vec3f, n: vec3f, level: u32) -> CausticsTent {
    let an = abs(n);
    let a = select(select(2u, 1u, an.y >= an.z), 0u, an.x >= an.y && an.x >= an.z);
    let u = (a + 1u) % 3u;
    let v = (a + 2u) % 3u;
    let cell = caustics_cell_size(level);
    let g = p / cell - 0.5;
    var base = vec3i(floor(g));
    base[a] = i32(floor((p[a] + select(-0.5, 0.5, n[a] >= 0.0) * cell) / cell));
    return CausticsTent(base, vec2f(g[u] - f32(base[u]), g[v] - f32(base[v])), u, v);
}

/** A célula `k` (0–3) da tenda e o peso bilinear dela. */
fn caustics_tent_cell(t: CausticsTent, k: u32) -> vec3i {
    var c = t.base;
    c[t.u] += i32(k & 1u);
    c[t.v] += i32((k >> 1u) & 1u);
    return c;
}

fn caustics_tent_weight(t: CausticsTent, k: u32) -> f32 {
    return select(1.0 - t.f.x, t.f.x, (k & 1u) != 0u) * select(1.0 - t.f.y, t.f.y, ((k >> 1u) & 1u) != 0u);
}
