// O nível de cada retalho numa vista de câmera (spec 041, R20): o critério da malha da câmera ativa (curvatura e
// fração da altura da imagem) com a câmera da vista (`adapt.view_slot` no pool `CameraMatrices`) e a histerese.
// Requer: surface_adapt, surface_adapt_view.

@compute @workgroup_size(WORKGROUP_SIZE)
fn surface_adapt_view_camera_level_main(
    @builtin(global_invocation_id) gid3: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
) {
    let idx = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    let count = adapt.patches_u * adapt.patches_v;
    if (idx >= count) { return; }
    var level = adapt.max_level;
    if (adapt.force_max == 0u) {
        level = adapt_view_level(adapt_camera_segments(idx, adapt.view_slot), idx);
    }
    adapt_patches[idx] = vec4u(level, 0u, 0u, 0u);
    atomicAdd(&adapt_hist[level], 1u);
}
