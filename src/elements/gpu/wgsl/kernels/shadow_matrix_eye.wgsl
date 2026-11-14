// O referencial do mapa de sombra virtual com a câmera ativa (spec 034, T060): a posição e a vista-projeção dela (pool das
// matrizes, pelo slot dos parâmetros). Requer: shadow_matrix, struct CameraMatrices, `shadow_cameras`.

@compute @workgroup_size(WORKGROUP_SIZE)
fn shadow_matrix_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let c = shadow_cameras[shadow_params.cameraSlot];
    shadow_matrix_write(gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE, c.position.xyz, c.viewProjection);
}
