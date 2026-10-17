// Triângulo de tela cheia dos passes de tela (pós-processamento e apresentação): `uv` em [0, 1], origem no canto
// superior esquerdo.

struct VsOut {
    @builtin(position) clip_position: vec4<f32>,
    @location(0) uv: vec2<f32>,
}

@vertex
fn vs_fullscreen(@builtin(vertex_index) vid: u32) -> VsOut {
    var out: VsOut;
    let x = f32((vid << 1u) & 2u);
    let y = f32(vid & 2u);
    out.clip_position = vec4<f32>(x * 2.0 - 1.0, 1.0 - y * 2.0, 0.0, 1.0);
    out.uv = vec2<f32>(x, y);
    return out;
}
