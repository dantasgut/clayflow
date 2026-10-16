// Estágio de câmera (spec 007): para cada câmera viva, view (inversa rígida da matriz de mundo do seu Transform),
// projection (perspectiva ou ortográfica, com a razão do canvas ou a fixa), viewProjection e posição de mundo.
// Requer: structs Camera, CameraMatrices, WorldTransform, CameraRecord, CameraInstance, CameraComposeParams; camera.

@compute @workgroup_size(WORKGROUP_SIZE)
fn camera_compose_main(
    @builtin(global_invocation_id) gid3: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
) {
    let i = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    if (i >= compose.count) { return; }
    let r = camera_records[camera_list[compose.first + i].record];
    let p = camera_params[r.cameraSlot];
    let world = worlds[r.transformSlot].world;
    let aspect = select(p.aspect, compose.canvas_aspect, p.aspectMode == 0u);
    var projection: mat4x4f;
    if (p.projection == 1u) {
        projection = camera_orthographic(p.orthoHeight, aspect, p.near, p.far);
    } else {
        projection = camera_perspective(p.fov, aspect, p.near, p.far);
    }
    let view = camera_view(world);
    camera_matrices[r.cameraSlot].view = view;
    camera_matrices[r.cameraSlot].projection = projection;
    camera_matrices[r.cameraSlot].viewProjection = projection * view;
    camera_matrices[r.cameraSlot].position = vec4f(world[3].xyz, 1.0);
}
