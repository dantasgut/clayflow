// Estágio da matriz de sombra (spec 007, research R11): para cada luz direcional que projeta, a matriz
// luz-vista-projeção do seu mapa — ortográfica ±10 (clip z em [0, 1]) com o olho a 10 m contra a direção da luz,
// mirando a origem.
// Requer: structs Light, ShadowMatrix, ShadowRecord, ShadowMatrixInstance, ShadowMatrixParams; camera.

@compute @workgroup_size(WORKGROUP_SIZE)
fn shadow_matrix_main(
    @builtin(global_invocation_id) gid3: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
) {
    let i = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    if (i >= shadow_params.count) { return; }
    let r = shadow_records[shadow_list[shadow_params.first + i].record];
    let dir = lights[r.lightSlot].direction.xyz;
    let view = camera_look_at(-dir * 10.0, vec3f(0.0), vec3f(0.0, 1.0, 0.0));
    let projection = camera_orthographic_box(-10.0, 10.0, -10.0, 10.0, 0.1, 50.0);
    shadow_matrices[r.shadowSlot].lightViewProj = projection * view;
}
