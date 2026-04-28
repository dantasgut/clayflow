struct UiQuad {
    rect:  vec4<f32>,  // x, y, w, h em pixels
    color: vec4<f32>,
}

struct ScreenParams {
    size: vec2<f32>,
    _pad: vec2<f32>,
}

@group(0) @binding(0) var<uniform> screen: ScreenParams;
@group(0) @binding(1) var<storage, read> quads: array<UiQuad>;

struct VsOut {
    @builtin(position) clip_position: vec4<f32>,
    @location(0) color: vec4<f32>,
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
    var out: VsOut;
    out.clip_position = vec4<f32>(ndc, 0.0, 1.0);
    out.color = q.color;
    return out;
}

@fragment
fn fs_main(in: VsOut) -> @location(0) vec4<f32> {
    return in.color;
}
