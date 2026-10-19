// Layout do histórico da refração traçada (spec 034, US7), comum ao traçado (`gi_refraction.wgsl`) e ao resolve
// (`gi_refraction_finish.wgsl`), em vec4f:
//   - o cabeçalho: a vista-projeção do quadro anterior (4);
//   - as duas metades da média temporal, alternadas (`gi.screen1.y`): por pixel a radiância em meia precisão, a
//     distância do primeiro acerto e os quadros acumulados;
//   - a marca de cada ladrilho de 8 × 8 pixels (há vidro ou água perto);
//   - a amostra do quadro por pixel (2): a radiância (w = 1 válida) e o primeiro acerto (xyz) com a distância (w) — o
//     traçado escreve, a continuação dos caminhos longos soma no canal deles, o resolve lê;
//   - os caminhos na fila de continuação do quadro (x, `bitcast`), escrito pelos argumentos do despacho indireto.
// Requer: gi, gi_refraction_history.

/** vec4f do cabeçalho do histórico: a vista-projeção do quadro anterior. */
const GI_REFRACTION_HEADER: u32 = 4u;
/** Lado do ladrilho da marcação (pixels). */
const GI_REFRACTION_TILE: u32 = 8u;

/** Pixels do alvo (o histórico guarda um por pixel em cada metade). */
fn gi_refraction_pixels() -> u32 {
    return u32(gi.screenSize.x) * u32(gi.screenSize.y);
}

/** Índice no histórico do pixel `p` na metade `half`. */
fn gi_refraction_at(half: u32, p: u32) -> u32 {
    return GI_REFRACTION_HEADER + half * gi_refraction_pixels() + p;
}

/** Ladrilhos do alvo por eixo. */
fn gi_refraction_tiles() -> vec2u {
    return (vec2u(gi.screenSize.xy) + vec2u(GI_REFRACTION_TILE - 1u)) / GI_REFRACTION_TILE;
}

/** Índice no histórico da marca do ladrilho `t` (depois das duas metades). */
fn gi_refraction_tile_at(t: vec2u) -> u32 {
    return GI_REFRACTION_HEADER + 2u * gi_refraction_pixels() + t.x + t.y * gi_refraction_tiles().x;
}

/** Índice no histórico da parte `k` (0 radiância, 1 primeiro acerto) da amostra do quadro do pixel `p`. */
fn gi_refraction_sample_at(p: u32, k: u32) -> u32 {
    let tiles = gi_refraction_tiles();
    return GI_REFRACTION_HEADER + 2u * gi_refraction_pixels() + tiles.x * tiles.y + 2u * p + k;
}

/** Índice no histórico dos caminhos na fila de continuação do quadro. */
fn gi_refraction_queued_at() -> u32 {
    return gi_refraction_sample_at(gi_refraction_pixels(), 0u);
}
