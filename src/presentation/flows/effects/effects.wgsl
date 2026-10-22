// Pós-processamento em HDR (spec 011): os efeitos leem e escrevem a cor linear em `rgba16float`, sem corte em [0, 1];
// a apresentação (`present_*`) é o último passe. Struct `EffectParams` gerado do schema
// (`p0 = strength, aux0, aux1, aux2`); `VsOut` e `vs_fullscreen` vêm do módulo `fullscreen`.

@fragment
fn fs_vignette(in: VsOut) -> @location(0) vec4<f32> {
    let c = textureSample(src_tex, src_smp, in.uv);
    let d = distance(in.uv, vec2<f32>(0.5, 0.5));
    let v = clamp(1.0 - d * params.p0.x, 0.0, 1.0);
    return vec4<f32>(c.rgb * v, c.a);
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
    // p0 = (strength, lift, gain, gamma) — `ColorGrading` em vocabulário de domínio. Sem teto: o HDR passa inteiro.
    let lift = params.p0.y;
    let gain = params.p0.z;
    let gamma = max(params.p0.w, 0.01);
    let graded = gamma_encode(max((c - lift) * gain, vec3<f32>(0.0)), gamma);
    return vec4<f32>(mix(c, graded, params.p0.x), 1.0);
}
