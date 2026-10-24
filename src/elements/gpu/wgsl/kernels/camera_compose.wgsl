// Estágio de câmera (spec 007): para cada câmera viva, view (inversa rígida da matriz de mundo do seu Transform),
// projection (perspectiva ou ortográfica, com a razão do canvas ou a fixa), viewProjection e posição de mundo. Com o
// antisserrilhado temporal (spec 034), `projection` e `viewProjection` levam o deslocamento da amostra dentro do pixel
// (translação em clip proporcional a w: vale para perspectiva e ortográfica, e raster e sprites o herdam); sem ele, a
// `unjitteredViewProjection`; a do quadro anterior fica em `previousViewProjection` (a atual no primeiro quadro e no
// corte, `history.x` = 1). As inversas (vista, vista-projeção sem deslocamento) e a vista anterior são calculadas aqui,
// uma vez por quadro (spec 037).
// Requer: structs Camera, CameraMatrices, WorldTransform, CameraRecord, CameraInstance, CameraComposeParams; camera,
// xform_rigid, xform_projective.

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
    let projection = camera_projection(p.projection, p.fov, p.orthoHeight, aspect, p.near, p.far);
    let view = camera_view(world);
    camera_publish(r.cameraSlot, p.cut, view, projection, world[3].xyz, compose.jitter);
}

// Publica as matrizes de uma câmera: a anterior sem deslocamento guardada antes de escrever a nova; no primeiro quadro
// (anterior toda zero) ou no corte, a anterior é a atual e o histórico recomeça.
fn camera_publish(slot: u32, cut: u32, view: mat4x4f, projection: mat4x4f, position: vec3f, jitter: vec4f) {
    let unjittered = projection * view;
    let previous = camera_matrices[slot].unjitteredViewProjection;
    let fresh = cut != 0u || (all(previous[3] == vec4f(0.0)) && all(previous[2] == vec4f(0.0)));
    let jittered = camera_shift(projection, jitter.xy);
    var before_view = camera_matrices[slot].view;
    if (fresh) { before_view = view; }
    camera_matrices[slot].previousView = before_view;
    camera_matrices[slot].view = view;
    camera_matrices[slot].inverseView = rigid_inverse(view);
    camera_matrices[slot].inverseUnjitteredViewProjection = projective_inverse(unjittered);
    camera_matrices[slot].projection = jittered;
    camera_matrices[slot].viewProjection = jittered * view;
    camera_matrices[slot].position = vec4f(position, 1.0);
    // `select` não aceita matrizes.
    var before = previous;
    if (fresh) { before = unjittered; }
    camera_matrices[slot].previousViewProjection = before;
    camera_matrices[slot].unjitteredViewProjection = unjittered;
    camera_matrices[slot].jitter = jitter;
    camera_matrices[slot].history = vec4f(select(0.0, 1.0, fresh), 0.0, 0.0, 0.0);
}
