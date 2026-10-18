// A lista dos pixels marcados pela refração (spec 034: antisserrilhado e dispersão), escrita: a medida acrescenta cada
// pixel marcado (`refraction_mark`, uma entrada por pixel) na camada do trabalho dele — 0 só o antisserrilhado (três
// raios), 1 ele e a dispersão (nove), 2 só a dispersão (três, um canal por fio) —, para que os grupos de fios das amostras
// extras façam o mesmo trabalho; cada camada, do tamanho da tela, comporta todos os pixels. As amostras extras são
// processadas em rodadas (`REFRACTION_ROUNDS`) do tamanho das texturas do caminho delas (um par entrada × amostra por
// texel da tela, `refraction_round_capacity` entradas), sobre as camadas em sequência: `refraction_marks_args_main`
// (um fio) fecha as contagens e prepara a primeira, `refraction_marks_next_main` (um fio) avança para a seguinte — o
// argumento do despacho indireto dos pares da rodada nas palavras 0–2 de `refraction_marks`, e na textura da contagem
// o total, o início da rodada e as entradas das camadas 0 e 1 (lidos pelas extras). Palavras de `refraction_marks`:
// 0–2 o argumento, 3, 6 e 7 os contadores das camadas, 4 o total, 5 o início da rodada.
// Requer: REFRACTION_EXTRA, refraction_marks (o buffer), refraction_mark_list_out, refraction_mark_count_out.

/** Entradas de uma rodada das amostras extras: um par (entrada, amostra extra) por texel da tela. */
fn refraction_round_capacity() -> u32 {
    let size = textureDimensions(refraction_mark_list_out);
    return size.x * size.y / REFRACTION_EXTRA;
}

/**
 * Acrescenta o pixel à lista dos marcados: `antialias`, as amostras extras dentro do pixel; `channels`, a dispersão (os
 * três canais em cada amostra; só ela, os três canais no centro).
 */
fn refraction_mark(pixel: vec2i, antialias: bool, channels: bool) {
    let layer = select(select(0u, 2u, channels), 1u, channels && antialias);
    let word = array<u32, 3>(3u, 6u, 7u)[layer];
    let i = atomicAdd(&refraction_marks[word], 1u);
    let width = textureDimensions(refraction_mark_list_out).x;
    let packed = u32(pixel.x) | (u32(pixel.y) << 16u) | select(0u, 1u << 31u, channels) | select(0u, 1u << 30u, antialias);
    textureStore(refraction_mark_list_out, vec2u(i % width, i / width), layer, vec4u(packed, 0u, 0u, 0u));
}

/** O argumento do despacho dos pares da rodada que começa em `base` e o início na textura da contagem. */
fn refraction_marks_round(total: u32, base: u32) {
    let n = select(0u, min(total - base, refraction_round_capacity()), total > base);
    atomicStore(&refraction_marks[0], (n * REFRACTION_EXTRA + 63u) / 64u);
    atomicStore(&refraction_marks[1], 1u);
    atomicStore(&refraction_marks[2], 1u);
    atomicStore(&refraction_marks[5], base);
    textureStore(refraction_mark_count_out, vec2u(1u, 0u), vec4u(base, 0u, 0u, 0u));
}

@compute @workgroup_size(1, 1, 1)
fn refraction_marks_args_main() {
    let n0 = atomicExchange(&refraction_marks[3], 0u);
    let n1 = atomicExchange(&refraction_marks[6], 0u);
    let n2 = atomicExchange(&refraction_marks[7], 0u);
    let total = n0 + n1 + n2;
    atomicStore(&refraction_marks[4], total);
    textureStore(refraction_mark_count_out, vec2u(0u, 0u), vec4u(total, 0u, 0u, 0u));
    textureStore(refraction_mark_count_out, vec2u(2u, 0u), vec4u(n0, 0u, 0u, 0u));
    textureStore(refraction_mark_count_out, vec2u(3u, 0u), vec4u(n1, 0u, 0u, 0u));
    refraction_marks_round(total, 0u);
}

@compute @workgroup_size(1, 1, 1)
fn refraction_marks_next_main() {
    refraction_marks_round(
        atomicLoad(&refraction_marks[4]),
        atomicLoad(&refraction_marks[5]) + refraction_round_capacity(),
    );
}
