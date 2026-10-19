// Cáusticas por fótons (spec 033, US5; R2): o hash espacial em mundo onde os fótons que passaram por superfícies
// especulares ou transmissivas (vidro, metal polido) depositam a luz na primeira difusa. Células cúbicas de lado
// `gi.extra.y`; cada balde: a chave (as coordenadas da célula, 10 bits cada, deslocadas de 512, +1 — 0 vazio), a soma
// do quadro em ponto fixo (rgb, a vazão de cada fóton: todos levam a mesma potência, as fontes escolhidas pela
// potência) e a irradiância acumulada (rgb, f32), e a idade. O cabeçalho: a potência por fóton do quadro (f32), os
// baldes ocupados no quadro anterior e a soma do quadro. Depósito e leitura no plano da superfície (`gi_photon_frame`):
// bilinear nas 4 células em volta do ponto, na camada dele no eixo da normal.
// Requer: gi (os baldes em `gi.counts.y`).

const GI_PHOTON_HEADER: u32 = 8u;
const GI_PHOTON_WORDS: u32 = 8u;
// Unidade do ponto fixo das somas: até 2²¹ fótons inteiros numa célula sem estourar o u32 (o foco do vidro concentra
// boa parte dos fótons do quadro em poucas células).
const GI_PHOTON_ONE: f32 = 2048.0;
const GI_PHOTON_EMPTY: u32 = 0u;
const GI_PHOTON_PROBES: u32 = 32u;

/** Baldes do hash (o resto do buffer depois do cabeçalho). */
fn gi_photon_slots() -> u32 {
    return max(gi.counts.y, 1u);
}

/** Chave da célula `c` (0 fora do alcance). */
fn gi_photon_key(c: vec3i) -> u32 {
    if (any(abs(c) > vec3i(511))) { return GI_PHOTON_EMPTY; }
    let u = vec3u(c + vec3i(512));
    return (u.x | (u.y << 10u) | (u.z << 20u)) + 1u;
}

/** Balde inicial da célula `c`. */
fn gi_photon_bucket(c: vec3i) -> u32 {
    let h = (bitcast<u32>(c.x) * 73856093u) ^ (bitcast<u32>(c.y) * 19349663u) ^ (bitcast<u32>(c.z) * 83492791u);
    return h % gi_photon_slots();
}

/** Primeira palavra do balde `slot`. */
fn gi_photon_word(slot: u32) -> u32 {
    return GI_PHOTON_HEADER + slot * GI_PHOTON_WORDS;
}

/**
 * A base de uma superfície no hash (spec 034, R6): o eixo dominante da normal (`axis`) e as coordenadas de célula do
 * ponto nos outros dois (`plane`, para a interpolação bilinear com as células centradas em (k + ½)·h). A camada de cada
 * célula no eixo dominante é a da altura do plano da superfície no centro dela (`gi_photon_frame_layer`): depósito e
 * leitura concordam em qualquer ponto da célula, também num plano inclinado que atravessa camadas. A área da superfície
 * numa coluna de células é h²/|n_dominante|; o eixo da normal não entra na interpolação (com ele, a cáustica de um plano
 * na fronteira de duas camadas saía com metade da energia).
 */
struct GiPhotonFrame {
    axis: u32,
    plane: vec2f,
    /** A coordenada no eixo dominante (em células) e as inclinações do plano nos outros dois. */
    height: f32,
    slopes: vec2f,
    /** |n_dominante|: a razão entre a área projetada e a da superfície. */
    slope: f32,
}

fn gi_photon_frame(p: vec3f, n: vec3f) -> GiPhotonFrame {
    let a = abs(n);
    var axis = 2u;
    if (a.x >= a.y && a.x >= a.z) { axis = 0u; } else if (a.y >= a.z) { axis = 1u; }
    let g = p / gi.extra.y;
    let others = array<vec2u, 3>(vec2u(1u, 2u), vec2u(0u, 2u), vec2u(0u, 1u))[axis];
    let na = select(min(n[axis], -1e-3), max(n[axis], 1e-3), n[axis] >= 0.0);
    return GiPhotonFrame(
        axis,
        vec2f(g[others.x], g[others.y]) - 0.5,
        g[axis],
        -vec2f(n[others.x], n[others.y]) / na,
        abs(na),
    );
}

/** A altura do plano (em células, no eixo dominante) no centro da célula `ij`. */
fn gi_photon_frame_height(f: GiPhotonFrame, ij: vec2i) -> f32 {
    return f.height + dot(f.slopes, vec2f(ij) - f.plane);
}

/** A célula `ij` no plano, na camada `layer` do eixo dominante. */
fn gi_photon_frame_cell(f: GiPhotonFrame, ij: vec2i, layer: i32) -> vec3i {
    if (f.axis == 0u) { return vec3i(layer, ij.x, ij.y); }
    if (f.axis == 1u) { return vec3i(ij.x, layer, ij.y); }
    return vec3i(ij.x, ij.y, layer);
}
