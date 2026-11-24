// Composição da refração traçada filtrada (spec 034, R3, T044a): como `refraction_composite_fs`, com a cor do filtro do
// sinal traçado (`temporal_filter_output`) no lugar da amostra crua.
// Requer: refraction_composite, REFRACTION_REQUEST_VALID, refraction_request, temporal_filter_output.

@fragment
fn refraction_composite_denoised_fs(@builtin(position) frag: vec4f) -> RefractionCompositeOut {
    let px = vec2u(frag.xy);
    let request = textureLoad(refraction_request, px, 0);
    if (refraction.enabled == 0u || (request.y & (REFRACTION_REQUEST_VALID | REFRACTION_REQUEST_REFLECT)) != REFRACTION_REQUEST_VALID) { discard; }
    return refraction_composed(px, request.xy, textureLoad(temporal_filter_output, px, 0).rgb);
}
