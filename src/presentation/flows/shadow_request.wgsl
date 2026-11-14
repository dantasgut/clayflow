// Pedidos de páginas do mapa de sombra virtual (spec 034, T060), depois do desenho principal: a profundidade da cena
// deste quadro diz quais páginas a imagem usa — o estágio de sombra do quadro seguinte as aloca e desenha (a série dos
// pedidos, atraso 1). Por pixel: o ponto do mundo, o nível dele (`sv_level`, o mesmo da leitura) e as páginas que a
// penumbra pode tocar (o ponto ± 2 texels), e a mesma região dois níveis acima (a reserva grossa para o que aparecer na
// borda da vista no quadro seguinte). `shadow_request_clear_main` zera os pedidos antes.
// Requer: shadow_virtual, WORKGROUP_SIZE, `shadow_matrices`, `sr_cameras`, `sr` e `sr_requests` (a profundidade da cena,
// sem ou com amostras, nas entradas `shadow_request_single` e `shadow_request_ms`).

@compute @workgroup_size(WORKGROUP_SIZE)
fn shadow_request_clear_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let i = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    if (i >= arrayLength(&sr_requests)) { return; }
    sr_requests[i] = 0u;
}

fn shadow_request_page(m: ShadowMatrix, k: u32, q: vec2f, margin: f32) {
    let lo = sv_page_of(m, k, q - margin);
    let hi = sv_page_of(m, k, q + margin);
    // A margem é menor que uma página: no máximo 2 × 2 páginas.
    for (var dy = 0; dy < 2; dy++) {
        for (var dx = 0; dx < 2; dx++) {
            let g = lo + vec2i(dx, dy);
            if (any(g > hi)) { continue; }
            if (sv_in_window(m, k, g)) { sr_requests[sv_request_word(m, sv_slot(m, k, g))] = 1u; }
        }
    }
}

fn shadow_request_at(pixel: vec2u, depth: f32, dims: vec2u) {
    if (depth >= 1.0) { return; }
    let size = vec2f(dims);
    let cam = sr_cameras[sr.cameraSlot];
    let ndc = pixel_to_ndc(vec2f(pixel) + 0.5, size);
    let h = cam.inverseUnjitteredViewProjection * vec4f(ndc, depth, 1.0);
    let world = h.xyz / h.w;
    let m = shadow_matrices[sr.casterSlot];
    if (sv_levels(m) == 0u) { return; }
    let q = sv_light(m, world).xy;
    let k = sv_level(m, q);
    // A margem da penumbra (o raio da grade 3 × 3 girada e o deslocamento dentro do texel), menor que uma página.
    shadow_request_page(m, k, q, 2.0 * sv_texel(m, k));
    let coarse = min(k + 2u, sv_levels(m) - 1u);
    if (coarse != k) { shadow_request_page(m, coarse, q, 2.0 * sv_texel(m, coarse)); }
}
