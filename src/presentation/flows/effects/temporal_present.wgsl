// Apresentação direto da resolução temporal (spec 034, G2): sem efeitos de pós, a nitidez já mapeia e codifica a
// imagem resolvida para o canvas — sem um passe só para levar a imagem à tela.

@fragment
fn fs_temporal_present(in: VsOut) -> @location(0) vec4<f32> {
    let pixel = vec2u(in.clip_position.xy);
    return present_output(present_map(taa_sharpened(vec2i(pixel))), pixel);
}
