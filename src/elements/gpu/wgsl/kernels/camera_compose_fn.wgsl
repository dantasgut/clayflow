// Câmeras com função `camera` do usuário (spec 009): depois da composição de todas as câmeras, cada câmera do grupo
// recebe a vista e a projeção da função dela (com o tempo simulado); viewProjection e posição de mundo como no estágio
// padrão. Saída com valor não finito mantém as matrizes do estágio padrão.
// Requer: structs Camera, CameraMatrices, WorldTransform, CameraFnRecord, CameraFnGroup; camera_point_types;
// camera_fn (ponto).

@group(0) @binding(0) var<storage, read>       camera_params:     array<Camera>;
@group(0) @binding(1) var<storage, read_write> camera_matrices:   array<CameraMatrices>;
@group(0) @binding(2) var<storage, read>       worlds:            array<WorldTransform>;
@group(0) @binding(3) var<storage, read>       camera_fn_records: array<CameraFnRecord>;
@group(0) @binding(4) var<storage, read>       camera_fn_list:    array<vec4u>;
@group(1) @binding(0) var<uniform>             camera_fn_group:   CameraFnGroup;

fn camera_fn_finite(m: mat4x4f) -> bool {
    for (var c = 0u; c < 4u; c++) {
        let v = m[c];
        if (any(v != v) || any(abs(v) > vec4f(3.4e38))) { return false; }
    }
    return true;
}

@compute @workgroup_size(64)
fn camera_compose_fn_main(
    @builtin(global_invocation_id) gid3: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
) {
    let i = gid3.x + gid3.y * nwg.x * 64u;
    if (i >= camera_fn_group.count) { return; }
    let e = camera_fn_list[camera_fn_group.first + i];
    let p = camera_params[e.x];
    let world = worlds[e.y].world;
    let aspect = select(p.aspect, camera_fn_group.canvas_aspect, p.aspectMode == 0u);
    let out = camera_fn(p, world, aspect, camera_fn_params(camera_fn_records[e.z]), camera_fn_group.time);
    if (!camera_fn_finite(out.view) || !camera_fn_finite(out.projection)) { return; }
    camera_matrices[e.x].view = out.view;
    camera_matrices[e.x].projection = out.projection;
    camera_matrices[e.x].viewProjection = out.projection * out.view;
    camera_matrices[e.x].position = vec4f(world[3].xyz, 1.0);
}
