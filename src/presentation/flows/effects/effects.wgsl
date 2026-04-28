struct EffectParams {
    p0: vec4<f32>,  // .x = strength/intensity, .y = aux, .z = aux2, .w = aux3
}

@group(0) @binding(0) var src_tex: texture_2d<f32>;
@group(0) @binding(1) var src_smp: sampler;
@group(0) @binding(2) var<uniform> params: EffectParams;

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

@fragment
fn fs_passthrough(in: VsOut) -> @location(0) vec4<f32> {
    return textureSample(src_tex, src_smp, in.uv);
}

@fragment
fn fs_vignette(in: VsOut) -> @location(0) vec4<f32> {
    let c = textureSample(src_tex, src_smp, in.uv);
    let d = distance(in.uv, vec2<f32>(0.5, 0.5));
    let v = clamp(1.0 - d * params.p0.x, 0.0, 1.0);
    return vec4<f32>(c.rgb * v, c.a);
}

@fragment
fn fs_fxaa(in: VsOut) -> @location(0) vec4<f32> {
    let texel = vec2<f32>(1.0) / vec2<f32>(textureDimensions(src_tex, 0));
    let nw = textureSample(src_tex, src_smp, in.uv + texel * vec2<f32>(-1.0, -1.0)).rgb;
    let ne = textureSample(src_tex, src_smp, in.uv + texel * vec2<f32>( 1.0, -1.0)).rgb;
    let sw = textureSample(src_tex, src_smp, in.uv + texel * vec2<f32>(-1.0,  1.0)).rgb;
    let se = textureSample(src_tex, src_smp, in.uv + texel * vec2<f32>( 1.0,  1.0)).rgb;
    let cc = textureSample(src_tex, src_smp, in.uv).rgb;
    let avg = (nw + ne + sw + se + cc) * 0.2;
    return vec4<f32>(mix(cc, avg, params.p0.x), 1.0);
}

@fragment
fn fs_tonemap(in: VsOut) -> @location(0) vec4<f32> {
    let c = textureSample(src_tex, src_smp, in.uv).rgb;
    let exposure = params.p0.x;
    let mapped = vec3<f32>(1.0) - exp(-c * exposure);
    return vec4<f32>(mapped, 1.0);
}

@fragment
fn fs_bloom(in: VsOut) -> @location(0) vec4<f32> {
    let texel = vec2<f32>(1.0) / vec2<f32>(textureDimensions(src_tex, 0));
    var sum = vec3<f32>(0.0);
    let r = i32(2);
    var w = 0.0;
    for (var dy: i32 = -r; dy <= r; dy = dy + 1) {
        for (var dx: i32 = -r; dx <= r; dx = dx + 1) {
            let s = textureSample(src_tex, src_smp, in.uv + vec2<f32>(f32(dx), f32(dy)) * texel).rgb;
            let bright = max(0.0, max(s.r, max(s.g, s.b)) - params.p0.y);
            sum = sum + s * bright;
            w = w + bright;
        }
    }
    let bloom = select(vec3<f32>(0.0), sum / max(w, 1e-3), w > 0.0);
    let cc = textureSample(src_tex, src_smp, in.uv).rgb;
    return vec4<f32>(cc + bloom * params.p0.x, 1.0);
}

@fragment
fn fs_blur(in: VsOut) -> @location(0) vec4<f32> {
    let texel = vec2<f32>(1.0) / vec2<f32>(textureDimensions(src_tex, 0));
    let r = i32(2);
    var sum = vec3<f32>(0.0);
    var n = 0.0;
    for (var dy: i32 = -r; dy <= r; dy = dy + 1) {
        for (var dx: i32 = -r; dx <= r; dx = dx + 1) {
            sum = sum + textureSample(src_tex, src_smp, in.uv + vec2<f32>(f32(dx), f32(dy)) * texel).rgb;
            n = n + 1.0;
        }
    }
    return vec4<f32>(sum / n, 1.0);
}

@fragment
fn fs_chromatic(in: VsOut) -> @location(0) vec4<f32> {
    let texel = vec2<f32>(1.0) / vec2<f32>(textureDimensions(src_tex, 0));
    let off = (in.uv - vec2<f32>(0.5)) * params.p0.x;
    let r = textureSample(src_tex, src_smp, in.uv + off * texel.x).r;
    let g = textureSample(src_tex, src_smp, in.uv).g;
    let b = textureSample(src_tex, src_smp, in.uv - off * texel.x).b;
    return vec4<f32>(r, g, b, 1.0);
}

@fragment
fn fs_color_grading(in: VsOut) -> @location(0) vec4<f32> {
    let c = textureSample(src_tex, src_smp, in.uv).rgb;
    let lift = params.p0.x;
    let gain = params.p0.y;
    let gamma = max(params.p0.z, 0.01);
    let graded = pow(clamp((c - lift) * gain, vec3<f32>(0.0), vec3<f32>(1.0)), vec3<f32>(1.0 / gamma));
    return vec4<f32>(graded, 1.0);
}

@fragment
fn fs_ssao(in: VsOut) -> @location(0) vec4<f32> {
    let c = textureSample(src_tex, src_smp, in.uv).rgb;
    let texel = vec2<f32>(1.0) / vec2<f32>(textureDimensions(src_tex, 0));
    var occlusion = 0.0;
    let radius = params.p0.x;
    for (var i: i32 = 0; i < 8; i = i + 1) {
        let theta = f32(i) * 0.7853;
        let off = vec2<f32>(cos(theta), sin(theta)) * radius;
        let s = textureSample(src_tex, src_smp, in.uv + off * texel).rgb;
        let lum_c = dot(c, vec3<f32>(0.299, 0.587, 0.114));
        let lum_s = dot(s, vec3<f32>(0.299, 0.587, 0.114));
        occlusion = occlusion + max(0.0, lum_c - lum_s);
    }
    let ao = clamp(1.0 - occlusion * 0.125, 0.0, 1.0);
    return vec4<f32>(c * ao, 1.0);
}
