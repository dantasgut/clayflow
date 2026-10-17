// Apresentação com resolve mapeado por amostra (spec 011, R1): cada amostra do MSAA é mapeada antes da média — a
// borda entre um realce muito forte e um fundo escuro fica suave, o que a média linear antes do mapeamento não dá.

@fragment
fn fs_present_ms(in: VsOut) -> @location(0) vec4<f32> {
    let pixel = vec2u(in.clip_position.xy);
    let n = textureNumSamples(src_ms);
    var sum = vec3f(0.0);
    for (var i = 0u; i < n; i = i + 1u) {
        sum = sum + present_map(textureLoad(src_ms, pixel, i).rgb);
    }
    return present_output(sum / f32(n), pixel);
}
