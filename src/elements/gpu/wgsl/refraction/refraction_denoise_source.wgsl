// A refração traçada como sinal do filtro (ponto `traced_denoise_source`; spec 034, R3, T044a): os pixels com pedido,
// a radiância traçada (`refraction_radiance`) e, como guia, o ponto em que termina o caminho que mais contribui para a
// cor com o registro do objeto (`refraction_hit`); o ponto anterior, a largura do pixel e a mudança da cena pelo que o
// histórico de um pixel com pedido precisa (`refraction_history`: o gradiente temporal).
// Requer: REFRACTION_REQUEST_VALID, refraction_history, refraction_request, refraction_radiance, refraction_hit.

fn traced_denoise_source_size() -> vec2u {
    return textureDimensions(refraction_request);
}

fn traced_denoise_source_valid(q: vec2u) -> bool {
    return (textureLoad(refraction_request, q, 0).y & REFRACTION_REQUEST_VALID) != 0u;
}

fn traced_denoise_source_signal(q: vec2u) -> vec3f {
    return textureLoad(refraction_radiance, q, 0).rgb;
}

fn traced_denoise_source_guide(q: vec2u) -> vec4f {
    return textureLoad(refraction_hit, q, 0);
}

fn traced_denoise_source_previous_point(guide: vec4f) -> vec3f {
    return refraction_previous_point(guide);
}

fn traced_denoise_source_footprint(q: vec2u, guide: vec4f) -> f32 {
    return refraction_footprint(q, guide);
}

fn traced_denoise_source_change(q: vec2u) -> f32 {
    return refraction_change(q);
}
