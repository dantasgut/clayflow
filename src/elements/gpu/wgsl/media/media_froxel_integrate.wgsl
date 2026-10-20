// Integração dos froxels (spec 033, R12): por coluna da tela, da câmera para o fundo, a luz espalhada e a transmitância
// acumuladas — em cada fatia, a integral exata do meio homogêneo nela (Hillaire: (S − S·e^(−σΔ))/σ), Δ o comprimento
// do raio na fatia — gravadas no texel da fatia (o caminho até o fim dela). A invocação 0 guarda a vista e a
// vista-projeção do quadro para a reprojeção do seguinte.
// Requer: WORKGROUP_SIZE, froxels, cameras, media_common, froxel_camera (escrita), froxel_history (o do quadro),
// froxel_scatter_out.

@compute @workgroup_size(WORKGROUP_SIZE)
fn froxel_integrate_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let i = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    let dims = froxels.grid.xyz;
    let cam = cameras[froxels.grid.w];
    if (i == 0u) {
        froxel_camera[0] = cam.view;
        froxel_camera[1] = cam.unjitteredViewProjection;
    }
    if (i >= dims.x * dims.y) { return; }
    let cell = vec2u(i % dims.x, i / dims.x);
    let uv = (vec2f(cell) + 0.5) / vec2f(dims.xy);
    let ndc = vec2f(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0);
    // Comprimento do raio por unidade de profundidade da vista nesta coluna (ortográfica: 1).
    let stretch = select(length(froxel_view_point(ndc, 1.0, froxel_projection(cam))), 1.0, froxel_projection(cam)[3][3] == 1.0);
    var scattered = vec3f(0.0);
    var transmittance = 1.0;
    var z0 = froxel_slice_depth(0.0);
    for (var k = 0u; k < dims.z; k++) {
        let z1 = froxel_slice_depth(f32(k + 1u));
        let v = textureLoad(froxel_history, vec3u(cell, k), 0);
        let dt = (z1 - z0) * stretch;
        let a = exp(-v.a * dt);
        let s = select(v.rgb * dt, v.rgb * (1.0 - a) / max(v.a, 1e-12), v.a > 1e-6);
        scattered += transmittance * s;
        transmittance *= a;
        textureStore(froxel_scatter_out, vec3u(cell, k), vec4f(scattered, transmittance));
        z0 = z1;
    }
}
