// Integração dos froxels (spec 033, R12): por coluna da tela, da câmera para o fundo, a luz espalhada e a transmitância
// acumuladas — em cada fatia, a integral exata do meio homogêneo nela (Hillaire: (S − S·e^(−σΔ))/σ), Δ o comprimento
// do raio na fatia — gravadas no texel da fatia (o caminho até o fim dela). A reprojeção do quadro seguinte lê a vista
// e a vista-projeção anteriores da câmera (spec 037).
// O meio contínuo (spec 041, R21: a atmosfera, `scene_medium_open`) soma à extinção dos volumes a dele, por canal
// (o Rayleigh tira mais o azul), no meio da fatia: a luz espalhada é atenuada pelas duas; a transmitância gravada (a) é
// só a dos volumes — a do meio contínuo, quem soma o resto dele (a perspectiva aérea do `Sky`) a aplica inteira. Por
// coluna, a luz do meio sem nenhuma sombra até o fim da grade (`froxel_open_out`): o que o fundo tira da vista do céu.
// As duas luzes gravadas em unidades de `FROXEL_RADIANCE_UNIT` (T075: perto do sol baixo elas passam do meio-float).
// Requer: WORKGROUP_SIZE, froxels, cameras, media_common, media_froxel_state, scene_medium_open,
// froxel_history (o do quadro), froxel_open_out,
// froxel_scatter_out, FROXEL_RADIANCE_UNIT.

@compute @workgroup_size(WORKGROUP_SIZE)
fn froxel_integrate_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let i = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    let dims = froxels.grid.xyz;
    let cam = cameras[froxels.grid.w];
    if (i >= dims.x * dims.y) { return; }
    let cell = vec2u(i % dims.x, i / dims.x);
    let uv = (vec2f(cell) + 0.5) / vec2f(dims.xy);
    let ndc = uv_to_ndc(uv);
    let proj = froxel_projection(cam);
    // Comprimento do raio por unidade de profundidade da vista nesta coluna (ortográfica: 1).
    let stretch = select(length(froxel_view_point(ndc, 1.0, proj)), 1.0, is_orthographic(cam.projection));
    // O meio contínuo não conta neste quadro e não há névoa (R21): a grade não é lida (`froxel_state`).
    if (!froxel_medium_state().x) { return; }
    var scattered = vec3f(0.0);
    var through = vec3f(1.0);
    var transmittance = 1.0;
    // A luz do meio contínuo sem nenhuma sombra, atenuada só por ele (R21 rodada 16): o que a vista do céu tem do trecho.
    var open = vec3f(0.0);
    var through_open = vec3f(1.0);
    let ray = normalize(froxel_world(cam, froxel_view_point(ndc, 1.0, proj)) - cam.position.xyz);
    var z0 = froxel_slice_depth(0.0);
    for (var k = 0u; k < dims.z; k++) {
        let z1 = froxel_slice_depth(f32(k + 1u));
        let v = textureLoad(froxel_history, vec3u(cell, k), 0);
        let dt = (z1 - z0) * stretch;
        let medium = scene_medium_open(froxel_world(cam, froxel_view_point(ndc, 0.5 * (z0 + z1), proj)), ray);
        let sigma = vec3f(v.a) + medium.extinction;
        let xo = medium.extinction * dt;
        let ao = exp(-xo);
        open += through_open * medium.radiance * dt
            * select((1.0 - ao) / max(xo, vec3f(1e-30)), 1.0 - xo * (0.5 - xo / 6.0), xo < vec3f(1e-3));
        through_open *= ao;
        let x = sigma * dt;
        let a = exp(-x);
        // (1 − e^(−x))/x pela série com x pequeno: a atmosfera nas fatias de centímetros (x ~ 10⁻⁷) perde a precisão do
        // f32 em 1 − e^(−x).
        let s = v.rgb * dt * select((1.0 - a) / max(x, vec3f(1e-30)), 1.0 - x * (0.5 - x / 6.0), x < vec3f(1e-3));
        scattered += through * s;
        through *= a;
        transmittance *= exp(-v.a * dt);
        textureStore(froxel_scatter_out, vec3u(cell, k), vec4f(scattered / FROXEL_RADIANCE_UNIT, transmittance));
        z0 = z1;
    }
    textureStore(froxel_open_out, cell, vec4f(open / FROXEL_RADIANCE_UNIT, 1.0));
}
