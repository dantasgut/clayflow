// Gradiente temporal da refração (spec 034, R3, T044a; o A-SVGF de Schied et al. 2018): uma invocação por bloco de
// `REFRACTION_STRATUM` × `REFRACTION_STRATUM` pixels (em ladrilhos de 8 × 8 blocos), antes do traçado do quadro. Em cada
// bloco, a amostra que o traçado fez no quadro anterior num pixel sorteado (o raio guardado em
// `refraction_gradient_origin` e `refraction_gradient_dir`, a cor dela ainda em `refraction_radiance`) é refeita na
// cena de agora com o mesmo raio e o mesmo estado aleatório: a amostra é determinística, então a diferença é só o que
// mudou na cena — um objeto, uma luz, uma sombra, também o que o pixel via por um caminho secundário (a reflexão interna
// que mostrava a bola) —, nunca o ruído nem o movimento da câmera. Sai (|Δ| da luminância, a maior das duas) em
// `refraction_gradient_out` (zero sem amostra no bloco). Depois, sorteia o pixel do bloco para o quadro seguinte e
// guarda o raio da câmera dele (o mesmo que o traçado deste quadro faz) em `refraction_gradient_origin_out` e
// `refraction_gradient_dir_out` (origem e plano próximo + 1; direção e pixel em bits); sem pedido, nada (w = 0).
// Requer: WORKGROUP_SIZE, REFRACTION_STRATUM, REFRACTION_REQUEST_VALID, refraction, refraction_path, camera_space,
// refraction_request, refraction_frame, refraction_radiance, refraction_gradient_origin,
// refraction_gradient_dir, refraction_gradient_out, refraction_gradient_origin_out, refraction_gradient_dir_out.

/** O pixel do bloco `stratum` sorteado no quadro `frame` (dentro de `size`). */
fn refraction_stratum_pixel(stratum: vec2u, frame: u32, size: vec2u) -> vec2u {
    let h = pcg_hash(hash_cell(vec3u(stratum, frame)));
    let offset = vec2u(h % REFRACTION_STRATUM, (h / REFRACTION_STRATUM) % REFRACTION_STRATUM);
    return min(stratum * REFRACTION_STRATUM + offset, size - 1u);
}

@compute @workgroup_size(WORKGROUP_SIZE)
fn refraction_gradient_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let strata = textureDimensions(refraction_gradient_out);
    // Cada grupo de 64 invocações cobre um ladrilho de 8 × 8 blocos: os raios refeitos de um grupo ficam juntos na tela
    // (numa linha longa de blocos, um só no vidro prenderia o grupo inteiro pelo caminho mais longo).
    let i = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    let tiles = (strata.x + 7u) / 8u;
    let tile = i / 64u;
    let stratum = vec2u(tile % tiles, tile / tiles) * 8u + vec2u(i % 8u, (i % 64u) / 8u);
    if (stratum.x >= strata.x || stratum.y >= strata.y) { return; }
    let size = textureDimensions(refraction_request);
    // A amostra do quadro anterior, refeita agora.
    let origin = textureLoad(refraction_gradient_origin, stratum, 0);
    var gradient = vec4f(0.0);
    if (origin.w >= 1.0 && refraction.frame > 0u) {
        let dir = textureLoad(refraction_gradient_dir, stratum, 0);
        let pixel = bitcast<u32>(dir.w);
        let px = vec2u(pixel % size.x, pixel / size.x);
        let before = luminance(textureLoad(refraction_radiance, px, 0).rgb);
        var state = refraction_seed(pixel, refraction.frame - 1u);
        let now = refraction_sample(RayCamera(origin.xyz, dir.xyz, origin.w - 1.0), refraction_camera_stack(), &state);
        let after = luminance(now.radiance);
        gradient = vec4f(abs(after - before), max(after, before), 0.0, 1.0);
    }
    textureStore(refraction_gradient_out, stratum, gradient);
    // O pixel do bloco que o quadro seguinte refaz.
    let px = refraction_stratum_pixel(stratum, refraction.frame, size);
    let request = textureLoad(refraction_request, px, 0);
    if ((request.y & REFRACTION_REQUEST_VALID) == 0u) {
        textureStore(refraction_gradient_origin_out, stratum, vec4f(0.0));
        return;
    }
    let ray = camera_ray(refraction.camera_slot, vec2f(px) + 0.5, vec2f(size));
    textureStore(refraction_gradient_origin_out, stratum, vec4f(ray.origin, ray.near + 1.0));
    textureStore(refraction_gradient_dir_out, stratum, vec4f(ray.dir, bitcast<f32>(px.x + px.y * size.x)));
}
