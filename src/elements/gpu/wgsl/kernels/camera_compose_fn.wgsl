// Câmeras com função `camera` do usuário (spec 009): depois da composição de todas as câmeras, cada câmera do grupo
// recebe a vista e a projeção da função dela (com o tempo simulado); viewProjection e posição de mundo como no estágio
// padrão. Cada entrada do grupo (`CameraFnEntry`) traz o slot da câmera, o da matriz de mundo e o do registro da função
// no pool da forma dela (spec 031). Saída com valor não finito mantém as matrizes do estágio padrão.
// Requer: structs Camera, CameraMatrices, WorldTransform, CameraFnEntry, CameraFnGroup; camera_point_types;
// camera_fn (ponto).

@compute @workgroup_size(WORKGROUP_SIZE)
fn camera_compose_fn_main(
    @builtin(global_invocation_id) gid3: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
) {
    let i = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    if (i >= camera_fn_group.count) { return; }
    let e = camera_fn_list[camera_fn_group.first + i];
    let p = camera_params[e.camera];
    let world = worlds[e.world].world;
    let aspect = select(p.aspect, camera_fn_group.canvas_aspect, p.aspectMode == 0u);
    let out = camera_fn(p, world, aspect, camera_fn_params(e.record), camera_fn_group.time);
    if (!finite_mat4(out.view) || !finite_mat4(out.projection)) { return; }
    camera_matrices[e.camera].view = out.view;
    camera_matrices[e.camera].projection = out.projection;
    camera_matrices[e.camera].viewProjection = out.projection * out.view;
    camera_matrices[e.camera].position = vec4f(world[3].xyz, 1.0);
}
