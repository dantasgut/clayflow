// Coleta final na tela (spec 033, R2 adendo): uma sonda de tela por ladrilho de `gi_screen_tile()` pixels de lado,
// posta onde o raio da câmera pelo centro do ladrilho atinge a cena. O buffer de trabalho guarda, por sonda, a posição
// (xyz) com a distância ao longo do raio (w, 0 = sem superfície) e a normal voltada para a câmera, e depois a
// irradiância do quadro de cada geração de rebatimento. O raio da câmera sai da câmera ativa como no fundo da cena:
// perspectiva pelos fatores da projeção, ortográfica pela origem deslocada.
// Requer: gi, cameras.

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

/** Índice no buffer de trabalho da posição da sonda `i` (a normal vem logo depois). */
fn gi_screen_probe_at(i: u32) -> u32 {
    return 2u * i;
}

/** Índice no buffer de trabalho da irradiância do quadro da geração `g` da sonda `i`. */
fn gi_screen_fresh_at(i: u32, g: u32) -> u32 {
    return 2u * gi_screen_count() + i * gi.bounces.x + g;
}

/** Centro do ladrilho `tile` em pixels (dentro do alvo, no último ladrilho parcial). */
fn gi_screen_tile_pixel(tile: vec2u) -> vec2f {
    let size = gi.screenSize.xy;
    return min((vec2f(tile) + 0.5) * gi_screen_tile(), size - 0.5);
}

/** Raio da câmera ativa pelo pixel `px` (origem e direção unitária). */
struct GiCameraRay {
    origin: vec3f,
    dir: vec3f,
}

fn gi_camera_ray(px: vec2f) -> GiCameraRay {
    let cam = cameras[gi.screen.w];
    let size = gi.screenSize.xy;
    let ndc = vec2f(px.x / size.x * 2.0 - 1.0, 1.0 - px.y / size.y * 2.0);
    let p = cam.projection;
    // A inversa da rotação da vista é a transposta.
    let rot = transpose(mat3x3f(cam.view[0].xyz, cam.view[1].xyz, cam.view[2].xyz));
    if (p[3][3] != 1.0) {
        return GiCameraRay(cam.position.xyz, normalize(rot * vec3f(ndc.x / p[0][0], ndc.y / p[1][1], -1.0)));
    }
    let offset = vec3f((ndc.x - p[3][0]) / p[0][0], (ndc.y - p[3][1]) / p[1][1], 0.0);
    return GiCameraRay(cam.position.xyz + rot * offset, normalize(rot * vec3f(0.0, 0.0, -1.0)));
}
