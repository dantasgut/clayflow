// Cáusticas por fótons (spec 034, T067c; antes da GI, spec 033 US5): o hash espacial em mundo onde os fótons que
// passaram por superfícies especulares ou transmissivas (vidro, água, metal polido) depositam a luz na primeira difusa.
// Os fótons saem em grade e cada um deposita a vazão na área em que a célula dele chegou (a malha de fótons, a razão de
// áreas das cáusticas de Shah et al. 2007 e das diferenciais de fóton de Schjøth et al. 2007: `caustics_splat`): onde a
// água ou o vidro concentram a luz a pegada encolhe — a cáustica fica nítida e mais clara na medida exata. Em níveis de
// células (`CAUSTICS_LEVELS`, o nível l com lado `caustics.extra.x` × 2^l): cada depósito vai ao nível do tamanho da
// pegada dele, e quem lê soma os níveis. Cada balde: a chave (as coordenadas da célula, 10 bits cada, deslocadas de 512,
// e o nível nos 3 bits de cima, +1 — 0 vazio), a soma do quadro em ponto fixo com sinal (rgb, a vazão de cada fóton,
// negativa na parcela da variável de controle) e a irradiância acumulada (rgb, f32). O cabeçalho: a potência por fóton
// do quadro (f32), os baldes ocupados no quadro anterior e a soma do quadro, e a âncora. Depósito e leitura pela tenda 2D no plano tangente (`caustics_tent`, spec 034 T057): uma camada de células
// ao longo da normal e a interpolação bilinear nos dois eixos tangentes — a irradiância é por área da superfície.
// Requer: caustics (os baldes em `caustics.counts.y`), hash_cell.

const CAUSTICS_HEADER: u32 = 12u;
/** Palavras do cabeçalho com a âncora das células (xyz, f32): o centro dos alvos dos fótons, em passos de meio metro. */
const CAUSTICS_ANCHOR: u32 = 8u;
const CAUSTICS_WORDS: u32 = 7u;
/** Níveis de células (lados de 1 a 32 vezes o da célula fina). */
const CAUSTICS_LEVELS: u32 = 6u;
/**
 * Peso do acumulado na média móvel de cada quadro (~4 quadros efetivos: (1 + h) / (1 − h)): a grade de fótons dá a
 * imagem quase sem ruído a cada quadro, e a média só integra o deslocamento da grade — a cáustica acompanha a água que
 * se move.
 */
const CAUSTICS_HYSTERESIS: f32 = 0.6;
// Unidade do ponto fixo das somas (com sinal): até 2²⁰ fótons inteiros numa célula sem estourar o i32 (o foco do vidro concentra
// boa parte dos fótons do quadro em poucas células).
const CAUSTICS_ONE: f32 = 2048.0;
const CAUSTICS_EMPTY: u32 = 0u;
const CAUSTICS_PROBES: u32 = 32u;

/** Baldes do hash (o resto do buffer depois do cabeçalho). */
fn caustics_slots() -> u32 {
    return max(caustics.counts.y, 1u);
}

/** Baldes de cada nível: o hash em faixas iguais, uma por nível. */
fn caustics_level_slots() -> u32 {
    return max(caustics_slots() / CAUSTICS_LEVELS, 1u);
}

/**
 * Chave da célula `c` (as coordenadas a partir da âncora, `caustics_cell_of`): x e z em 11 bits, y em 10 — 0 fora do
 * alcance (quem deposita sobe de nível).
 */
fn caustics_key(c: vec3i) -> u32 {
    if (abs(c.x) > 1023 || abs(c.z) > 1023 || abs(c.y) > 511) { return CAUSTICS_EMPTY; }
    let u = vec3u(c + vec3i(1024, 512, 1024));
    return (u.x | (u.z << 11u) | (u.y << 22u)) + 1u;
}

/** Balde inicial da célula `c` na faixa do nível `level`. */
fn caustics_bucket(c: vec3i, level: u32) -> u32 {
    let n = caustics_level_slots();
    return level * n + hash_cell(bitcast<vec3u>(c)) % n;
}

/** O balde depois de `slot` na faixa do nível `level` (a sondagem linear dá a volta na faixa). */
fn caustics_probe_next(slot: u32, level: u32) -> u32 {
    let n = caustics_level_slots();
    return level * n + (slot - level * n + 1u) % n;
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
 * A tenda 2D no plano tangente do ponto `p` de normal `n` no nível `level`: o eixo dominante da normal (`a`) é o das
 * camadas e, nos outros dois (`u`, `v`), a célula de base e as frações da interpolação bilinear. A camada de cada uma
 * das 4 células sai do plano tangente no centro dela (meio passo para fora da superfície): no plano inclinado as
 * vizinhas ficam em outras alturas, e a camada pelo ponto mandaria o depósito e a leitura para camadas diferentes (a 30°
 * a leitura perdia um quarto da luz). `cosine` = |n_a| leva a área da célula, projetada no plano das camadas, à da
 * superfície (spec 034, T057).
 */
struct CausticsTent {
    base: vec3i,
    f: vec2f,
    u: u32,
    v: u32,
    a: u32,
    layers: vec4i,
    cosine: f32,
}

fn caustics_tent(p: vec3f, n: vec3f, level: u32) -> CausticsTent {
    let an = abs(n);
    let a = select(select(2u, 1u, an.y >= an.z), 0u, an.x >= an.y && an.x >= an.z);
    let u = (a + 1u) % 3u;
    let v = (a + 2u) % 3u;
    let cell = caustics_cell_size(level);
    let g = p / cell - 0.5;
    let base = vec3i(floor(g));
    let outward = select(-0.5, 0.5, n[a] >= 0.0) * cell;
    var layers: vec4i;
    for (var k = 0u; k < 4u; k++) {
        let cu = (f32(base[u] + i32(k & 1u)) + 0.5) * cell;
        let cv = (f32(base[v] + i32((k >> 1u) & 1u)) + 0.5) * cell;
        let h = p[a] - (n[u] * (cu - p[u]) + n[v] * (cv - p[v])) / n[a];
        layers[k] = i32(floor((h + outward) / cell));
    }
    return CausticsTent(base, vec2f(g[u] - f32(base[u]), g[v] - f32(base[v])), u, v, a, layers, an[a]);
}

/** A célula `k` (0–3) da tenda e o peso bilinear dela. */
fn caustics_tent_cell(t: CausticsTent, k: u32) -> vec3i {
    var c = t.base;
    c[t.u] += i32(k & 1u);
    c[t.v] += i32((k >> 1u) & 1u);
    c[t.a] = t.layers[k];
    return c;
}

fn caustics_tent_weight(t: CausticsTent, k: u32) -> f32 {
    return select(1.0 - t.f.x, t.f.x, (k & 1u) != 0u) * select(1.0 - t.f.y, t.f.y, ((k >> 1u) & 1u) != 0u);
}
