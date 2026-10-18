// Cáusticas por fótons (spec 033, US5; R2): o hash espacial em mundo onde os fótons que passaram por superfícies
// especulares ou transmissivas (vidro, metal polido) depositam a luz na primeira difusa. Células cúbicas de lado
// `gi.extra.y`; cada balde: a chave (as coordenadas da célula, 10 bits cada, deslocadas de 512, +1 — 0 vazio), a soma
// do quadro em ponto fixo (rgb, a vazão de cada fóton: todos levam a mesma potência, as fontes escolhidas pela
// potência) e a irradiância acumulada (rgb, f32), e a idade. O cabeçalho: a potência por fóton do quadro (f32), os
// baldes ocupados no quadro anterior e a soma do quadro. Quem desenha lê a irradiância das 8 células em volta do ponto
// (trilinear: sem os blocos das células).
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

