// Colocação das sondas de tela (spec 033, R2 adendo): o raio da câmera pelo centro de cada ladrilho na estrutura de
// raios; o acerto pela frente dá a posição, a distância e a normal (voltada para a câmera). Sem acerto, ou na face de
// trás (a câmera dentro de um objeto), a sonda fica sem superfície e o desenho usa as sondas do mundo ali. A sonda decide
// aqui, uma vez, se lança raios no quadro (`w` da normal): na vez dela no rodízio ou, fora da vez, sem histórico.
// Roda na despacho dos acertos das sondas do mundo (`gi_probe_hit_main`), depois dos raios delas.
// Requer: NONE, gi, gi_screen_common, gi_screen_reproject, ray_scene, gi_screen_work.

/** Coloca a sonda de tela `i`. */
fn gi_screen_place(i: u32) {
    if (i >= gi_screen_count()) { return; }
    let tile = vec2u(i % gi.screen.x, i / gi.screen.x);
    let ray = gi_camera_ray(gi_screen_tile_pixel(tile));
    let max_dist = gi.tuning.w * 4.0;
    let hit = ray_scene_hit(ray.origin, ray.dir, max_dist);
    let at = gi_screen_probe_at(i);
    if (hit.t >= max_dist || hit.face < 0.0) {
        gi_screen_work[at] = vec4f(0.0);
        gi_screen_work[at + 1u] = vec4f(0.0);
        return;
    }
    let n = select(hit.normal, -hit.normal, dot(hit.normal, ray.dir) > 0.0);
    gi_screen_work[at] = vec4f(hit.position, hit.t);
    // Fora da vez no rodízio, só a sonda sem histórico (recém-descoberta) lança.
    let launch = gi_screen_scheduled(i) || !gi_screen_history_found(gi_screen_history_taps(hit.position, n));
    gi_screen_work[at + 1u] = vec4f(n, select(0.5, 1.0, launch));
}
