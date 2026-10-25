// A refração traçada como sinal do filtro (ponto `temporal_filter_source`; spec 034, R3, T044a): os pixels com pedido,
// a radiância traçada (`refraction_radiance`) e, como guias, o ponto em que termina o caminho que mais contribui para a
// cor com o registro do objeto (`refraction_hit`) e o albedo da superfície nele (`refraction_albedo`); o ponto
// anterior, a largura do pixel e a mudança da cena pelo que o histórico de um pixel com pedido precisa
// (`refraction_history`: o gradiente temporal).
// Requer: REFRACTION_REQUEST_VALID, refraction_history, refraction_request, refraction_radiance, refraction_hit,
// refraction_albedo.

fn temporal_filter_source_size() -> vec2u {
    return textureDimensions(refraction_request);
}

fn temporal_filter_source_valid(q: vec2u) -> bool {
    return (textureLoad(refraction_request, q, 0).y & REFRACTION_REQUEST_VALID) != 0u;
}

fn temporal_filter_source_signal(q: vec2u) -> vec3f {
    return textureLoad(refraction_radiance, q, 0).rgb;
}

fn temporal_filter_source_guide(q: vec2u) -> vec4f {
    return textureLoad(refraction_hit, q, 0);
}

fn temporal_filter_source_albedo(q: vec2u) -> vec3f {
    return textureLoad(refraction_albedo, q, 0).rgb;
}

fn temporal_filter_source_previous_point(guide: vec4f) -> vec3f {
    return refraction_previous_point(guide);
}

fn temporal_filter_source_footprint(q: vec2u, guide: vec4f) -> f32 {
    return refraction_footprint(q, guide);
}

fn temporal_filter_source_change(q: vec2u) -> f32 {
    // No corte de câmera (`history.x`, spec 037) a cena mudou toda: o filtro recomeça o histórico.
    return max(refraction_change(q), cameras[refraction.camera_slot].history.x);
}
