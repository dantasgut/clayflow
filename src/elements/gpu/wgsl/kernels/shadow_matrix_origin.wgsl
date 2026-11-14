// O referencial do mapa de sombra virtual sem câmera (spec 034, T060): os níveis em volta da origem e a vista-projeção
// zero (a reserva grossa sem o teste do frustum). Requer: shadow_matrix.

@compute @workgroup_size(WORKGROUP_SIZE)
fn shadow_matrix_origin_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    shadow_matrix_write(gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE, vec3f(0.0), mat4x4f());
}
