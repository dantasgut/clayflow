// Coleta final na tela (spec 033, R2 adendo): uma sonda de tela por ladrilho de `gi_screen_tile()` pixels de lado,
// posta onde o raio da câmera pelo centro do ladrilho atinge a cena. O buffer de trabalho guarda, por sonda, a posição
// (xyz) com a distância ao longo do raio (w, 0 = sem superfície) e a normal voltada para a câmera, depois a
// irradiância do quadro de cada geração de rebatimento e, por raio, a direção e o peso da amostragem mista
// (`gi_screen_guide_main`, spec 034 T051). O raio da câmera sai da câmera ativa como no fundo da cena:
// perspectiva pelos fatores da projeção, ortográfica pela origem deslocada.
// Requer: gi, camera_space.

/** Pixels por lado do ladrilho de uma sonda de tela (a qualidade: 4, 8 ou 16). */
fn gi_screen_tile() -> f32 {
    return gi.screenSize.z;
}

/** Sondas de tela no quadro (ladrilhos em x × y). */
fn gi_screen_count() -> u32 {
    return gi.screen.x * gi.screen.y;
}

/**
 * A sonda `i` lança raios neste quadro? Rodízio pela fração das sondas (`gi.screen1.x` = período): todas com 1, xadrez
 * com 2, 2 × 2 com 4 — as outras herdam o histórico reprojetado.
 */
fn gi_screen_scheduled(i: u32) -> bool {
    let period = max(gi.screen1.x, 1u);
    if (period == 1u) { return true; }
    let tx = i % gi.screen.x;
    let ty = i / gi.screen.x;
    let phase = select((tx & 1u) + 2u * (ty & 1u), (tx + ty) & 1u, period == 2u);
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
    return 2u * gi_screen_count() + i * gi.bounces.x + g;
}

/**
 * Índice no buffer de trabalho do par de raios `k` e `k + 1` (k par) da sonda `i`: por raio, a direção octaédrica (16
 * bits por eixo, os bits num f32) e o peso (cos / pdf) — dois raios por vec4f.
 */
fn gi_screen_ray_at(i: u32, k: u32) -> u32 {
    return (2u + gi.bounces.x) * gi_screen_count() + (i * gi.screen.z + k) / 2u;
}

/** Centro do ladrilho `tile` em pixels (dentro do alvo, no último ladrilho parcial). */
fn gi_screen_tile_pixel(tile: vec2u) -> vec2f {
    let size = gi.screenSize.xy;
    return min((vec2f(tile) + 0.5) * gi_screen_tile(), size - 0.5);
}

/** Raio da câmera ativa pelo pixel `px` (origem e direção unitária). */
fn gi_camera_ray(px: vec2f) -> RayCamera {
    return camera_ray(gi.screen.w, px, gi.screenSize.xy);
}
