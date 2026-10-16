// Quads de UI. Structs `UiQuad` e `ScreenParams` gerados dos schemas.

struct VsOut {
    @builtin(position) clip_position: vec4<f32>,
    @location(0)       color:         vec4<f32>,
    @location(1)       uv:            vec2<f32>,
    @location(2)       textured:      f32,
}

@vertex
fn vs_main(@builtin(vertex_index) vid: u32) -> VsOut {
    let quadIdx = vid / 6u;
    let cornerIdx = vid % 6u;
    let q = quads[quadIdx];
    var corners: array<vec2<f32>, 6>;
    corners[0] = vec2<f32>(0.0, 0.0);
    corners[1] = vec2<f32>(1.0, 0.0);
    corners[2] = vec2<f32>(0.0, 1.0);
    corners[3] = vec2<f32>(1.0, 0.0);
    corners[4] = vec2<f32>(1.0, 1.0);
    corners[5] = vec2<f32>(0.0, 1.0);
    let local = corners[cornerIdx];
    let pixel = vec2<f32>(q.rect.x + local.x * q.rect.z, q.rect.y + local.y * q.rect.w);
    let ndc = vec2<f32>((pixel.x / screen.size.x) * 2.0 - 1.0, 1.0 - (pixel.y / screen.size.y) * 2.0);
    let u = mix(q.uv.x, q.uv.z, local.x);
    let v = mix(q.uv.y, q.uv.w, local.y);
    var out: VsOut;
    out.clip_position = vec4<f32>(ndc, 0.0, 1.0);
    out.color = q.color;
    out.uv = vec2<f32>(u, v);
    out.textured = q.textured.x;
    return out;
}

@fragment
fn fs_main(in: VsOut) -> @location(0) vec4<f32> {
    // Sampling acontece unconditionalmente (textureSample exige uniform control
    // flow). Usamos `textured.x ∈ {0,1}` como peso para `mix` entre máscara do
    // atlas e alpha original. Isso suporta tipografia colorida com canal A do
    // atlas como máscara, multiplicada pelo tint da quad.
    let sample = textureSample(atlas, atlas_smp, in.uv);
    let textured_alpha = in.color.a * sample.a;
    let final_alpha = mix(in.color.a, textured_alpha, in.textured);
    return vec4<f32>(in.color.rgb, final_alpha);
}
