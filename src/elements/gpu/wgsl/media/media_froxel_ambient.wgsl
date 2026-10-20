// Luz ambiente dos froxels (spec 033, R12): numa grade mais grossa alinhada à dos froxels (as mesmas coordenadas
// normalizadas da tela e das fatias), a radiância média que chega de todas as direções (`scene_ambient`: o hemisfério
// ou a luz rebatida das sondas) — varia devagar no espaço; a injeção a lê trilinear em vez de consultar as sondas em
// cada froxel. O ponto da célula é sorteado a cada quadro.
// Requer: WORKGROUP_SIZE, froxels, cameras, media_common, scene_ambient, froxel_ambient_out.

@compute @workgroup_size(WORKGROUP_SIZE)
fn froxel_ambient_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let i = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    let dims = textureDimensions(froxel_ambient_out);
    if (i >= dims.x * dims.y * dims.z) { return; }
    let cell = vec3u(i % dims.x, (i / dims.x) % dims.y, i / (dims.x * dims.y));
    // Um ponto sorteado na célula a cada quadro (a sequência do quadro girada por célula): o histórico dos froxels faz a
    // média na célula — sem o moiré entre a grade e o campo das sondas.
    let uvw = (vec3f(cell) + fract(froxels.frame.xyz + froxel_rotation(cell + vec3u(7u)))) / vec3f(dims);
    let cam = cameras[froxels.grid.w];
    let ndc = vec2f(uvw.x * 2.0 - 1.0, 1.0 - uvw.y * 2.0);
    let z = froxel_slice_depth(uvw.z * f32(froxels.grid.z));
    let p = froxel_world(cam, froxel_view_point(ndc, z, froxel_projection(cam)));
    textureStore(froxel_ambient_out, cell, vec4f(scene_ambient(p), 1.0));
}
