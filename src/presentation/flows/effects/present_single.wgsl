// Apresentação de uma imagem resolvida (sem MSAA, ou a saída do último efeito): um texel por pixel.

@fragment
fn fs_present(in: VsOut) -> @location(0) vec4<f32> {
    let pixel = vec2u(in.clip_position.xy);
    return present_output(present_map(textureLoad(src_tex, pixel, 0).rgb), pixel);
}
