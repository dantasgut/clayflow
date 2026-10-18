// Colocação das sondas de tela (spec 033, R2 adendo): o raio da câmera pelo centro de cada ladrilho na estrutura de
// raios; o acerto pela frente dá a posição, a distância e a normal (voltada para a câmera). Sem acerto, ou na face de
// trás (a câmera dentro de um objeto), a sonda fica sem superfície e o desenho usa as sondas do mundo ali.
// Requer: WORKGROUP_SIZE, gi, gi_screen_common, ray_scene, gi_screen_work.

@compute @workgroup_size(WORKGROUP_SIZE)
fn gi_screen_place_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let i = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
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
    gi_screen_work[at + 1u] = vec4f(n, 1.0);
}
