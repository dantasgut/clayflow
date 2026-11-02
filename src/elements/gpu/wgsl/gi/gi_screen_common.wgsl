// Coleta final na tela (spec 033, R2 adendo): uma sonda de tela por ladrilho de `gi_screen_tile()` pixels de lado,
// posta onde o raio da câmera pelo centro do ladrilho atinge a cena. O buffer de trabalho guarda, por sonda, a posição
// (xyz) com a distância ao longo do raio (w, 0 = sem superfície) e a normal voltada para a câmera, depois a
// irradiância do quadro de cada geração de rebatimento e, por raio, a direção e o peso da amostragem mista
// (`gi_screen_guide_main`, spec 034 T051). O raio da câmera sai da câmera ativa como no fundo da cena:
// perspectiva pelos fatores da projeção, ortográfica pela origem deslocada.
// Sondas extras (spec 034, T058): na grade fina a meio ladrilho, alinhada à dos ladrilhos (o ponto fino 2t é a sonda do
// ladrilho t), as três posições finas de cada ladrilho que as sondas dos ladrilhos não cobrem (a dobra entre duas
// paredes, a borda de um objeto) ganham uma sonda extra numa das vagas depois das dos ladrilhos — o mesmo traçado,
// acúmulo e filtro. O mapa fino (por ladrilho, a vaga + 1 de cada posição fina, 0 sem sonda) fica no trabalho e, num
// vec4f por ladrilho, no histórico; as texturas do desenho guardam as sondas no texel da grade fina (com o refinamento 1, a dos ladrilhos).
// Requer: gi, camera_space.

/** Pixels por lado do ladrilho de uma sonda de tela (a qualidade: 4, 8 ou 16). */
fn gi_screen_tile() -> f32 {
    return gi.screenSize.z;
}

/** Sondas dos ladrilhos no quadro (ladrilhos em x × y). */
fn gi_screen_count() -> u32 {
    return gi.screen.x * gi.screen.y;
}

/** Refinamento da grade das texturas: 2 com as sondas extras a meio ladrilho, 1 sem. */
fn gi_screen_refine() -> u32 {
    return max(gi.screen1.y, 1u);
}

/** Sondas de tela no quadro: as dos ladrilhos e as vagas das extras. */
fn gi_screen_total() -> u32 {
    return gi_screen_count() + gi.screen1.w;
}

/**
 * O ladrilho `tile` lança raios neste quadro? Rodízio pela fração das sondas (`gi.screen1.x` = período): todos com 1,
 * xadrez com 2, 2 × 2 com 4 — os outros herdam o histórico reprojetado. As sondas extras seguem o ladrilho delas.
 */
fn gi_screen_scheduled(tile: vec2u) -> bool {
    let period = max(gi.screen1.x, 1u);
    if (period == 1u) { return true; }
    let phase = select((tile.x & 1u) + 2u * (tile.y & 1u), (tile.x + tile.y) & 1u, period == 2u);
    return phase == gi.rays.y % period;
}

/**
 * Índice no buffer de trabalho da posição da sonda `i` (a normal vem logo depois, com `w` = 1 quando a sonda lança raios
 * no quadro, 0,5 quando herda o histórico).
 */
fn gi_screen_probe_at(i: u32) -> u32 {
    return 2u * i;
}

/** Índice no buffer de trabalho da irradiância do quadro da geração `g` da sonda `i`. */
fn gi_screen_fresh_at(i: u32, g: u32) -> u32 {
    return 2u * gi_screen_total() + i * gi.bounces.x + g;
}

/**
 * Índice no buffer de trabalho do par de raios `k` e `k + 1` (k par) da sonda `i`: por raio, a direção octaédrica (16
 * bits por eixo, os bits num f32) e o peso (cos / pdf) — dois raios por vec4f.
 */
fn gi_screen_ray_at(i: u32, k: u32) -> u32 {
    return (2u + gi.bounces.x) * gi_screen_total() + (i * gi.screen.z + k) / 2u;
}

/**
 * Índice no buffer de trabalho do mapa fino da posição fina `k` (0 à direita, 1 abaixo, 2 na diagonal) do ladrilho de
 * índice `tile`: em `x`, a vaga + 1 da sonda extra ali, 0 sem (uma entrada por posição: cada uma tem uma só invocação
 * que a grava).
 */
fn gi_screen_map_at(tile: u32, k: u32) -> u32 {
    return (2u + gi.bounces.x + gi.screen.z / 2u) * gi_screen_total() + 3u * tile + k;
}

/** Índice no buffer de trabalho do texel fino (xy) da sonda extra na vaga `slot`. */
fn gi_screen_meta_at(slot: u32) -> u32 {
    return gi_screen_map_at(gi_screen_count(), 0u) + slot;
}

/** A posição fina `k` (0 à direita, 1 abaixo, 2 na diagonal) de um ladrilho, em texels finos a partir do dele. */
fn gi_screen_fine_offset(k: u32) -> vec2u {
    return vec2u(select(1u, 0u, k == 1u), select(0u, 1u, k >= 1u));
}

/** A posição fina de um texel fino ímpar (0 à direita, 1 abaixo, 2 na diagonal). */
fn gi_screen_fine_slot(t: vec2u) -> u32 {
    return (t.x & 1u) + 2u * (t.y & 1u) - 1u;
}

/** Centro do ladrilho `tile` em pixels (dentro do alvo, no último ladrilho parcial). */
fn gi_screen_tile_pixel(tile: vec2u) -> vec2f {
    let size = gi.screenSize.xy;
    return min((vec2f(tile) + 0.5) * gi_screen_tile(), size - 0.5);
}

/** O ponto fino `t` em pixels (a meio ladrilho; o ponto 2t é o centro do ladrilho t). */
fn gi_screen_fine_pixel(t: vec2u) -> vec2f {
    return (vec2f(t) + 1.0) * (0.5 * gi_screen_tile());
}

/** O ponto fino `t` cai dentro do alvo (fora dele não há sonda extra nem texel). */
fn gi_screen_fine_inside(t: vec2i) -> bool {
    return all(t >= vec2i(0)) && all(gi_screen_fine_pixel(vec2u(t)) < gi.screenSize.xy);
}

/** Raio da câmera ativa pelo pixel `px` (origem e direção unitária). */
fn gi_camera_ray(px: vec2f) -> RayCamera {
    return camera_ray(gi.screen.w, px, gi.screenSize.xy);
}
