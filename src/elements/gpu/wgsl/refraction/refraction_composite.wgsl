// Composição da refração traçada (spec 034, R1, T045): um triângulo de tela cheia sobre os alvos da cena, depois do
// traçado. No pixel com pedido, a cor é a do próprio pixel traçada — a radiância transmitida mais a refletida na
// primeira interface —, com a névoa entre a câmera e essa interface (ponto de cena `scene_fog`, no ponto do raio da
// câmera à distância do pedido); a profundidade é a do pedido (a interface mais próxima), para os passes seguintes; a
// luz que chega (`FrameTargets.light`, sem MSAA) fica "sem luz medida" (zero, como no fundo): a cor do pixel é a do
// traçado, e a luz guardada do opaco de trás reiluminaria o histórico da resolução temporal (T065h) — o que muda no que
// o vidro mostra quem diz é a máscara reativa. Sem pedido, nada muda. Nenhuma leitura da cor da cena: o que está atrás vem só do raio. Com o antisserrilhado temporal, a
// cor traçada é a filtrada (`refraction_composite_denoised`).
// Requer: refraction_screen, refraction, camera_space, scene_fog, REFRACTION_REQUEST_VALID, refraction_request,
// refraction_radiance, refraction_request_depth.

struct RefractionCompositeOut {
    @location(0) color: vec4f,
    @location(1) light: vec2f,
    @builtin(frag_depth) depth: f32,
}

/** A cor traçada `traced` do pixel `px` com pedido `request`, com a névoa até a primeira interface. */
fn refraction_composed(px: vec2u, request: vec2u, traced: vec3f) -> RefractionCompositeOut {
    let size = vec2f(textureDimensions(refraction_request));
    let ray = camera_ray(refraction.camera_slot, vec2f(px) + 0.5, size);
    let fog = scene_fog(ray.origin + ray.dir * bitcast<f32>(request.x));
    var out: RefractionCompositeOut;
    out.color = vec4f(traced * fog.a + fog.rgb, 1.0);
    out.light = vec2f(0.0);
    out.depth = textureLoad(refraction_request_depth, px, 0);
    return out;
}

@fragment
fn refraction_composite_fs(@builtin(position) frag: vec4f) -> RefractionCompositeOut {
    let px = vec2u(frag.xy);
    let request = textureLoad(refraction_request, px, 0);
    if ((request.y & REFRACTION_REQUEST_VALID) == 0u) { discard; }
    return refraction_composed(px, request.xy, textureLoad(refraction_radiance, px, 0).rgb);
}
