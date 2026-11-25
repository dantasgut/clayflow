// Os texels da sombra das luzes de área (spec 013, R5) que valem para o ponto de mundo `p` de normal `n`: o ponto volta
// à tela do quadro em que o `AreaShadowFlow` os calculou (a vista-projeção de antes) e os quatro em volta entram pelo
// peso bilinear, só os do mesmo ponto da superfície (o plano da normal e a distância). Cada um: (x, y, peso); peso 0,
// fora. O que está parado não depende do quadro: a leitura não fica atrás da câmera.
// Requer: view_space, cameras, area_shadow, area_shadow_point.

fn area_shadow_taps(p: vec3f, n: vec3f) -> array<vec3f, 4> {
    var taps: array<vec3f, 4>;
    let cam = cameras[area_shadow.camera];
    let far = distance(p, cam.position.xyz);
    let clip = cam.previousViewProjection * vec4f(p, 1.0);
    if (clip.w <= 0.0) { return taps; }
    let dim = vec2i(textureDimensions(area_shadow_point));
    let x = ndc_to_uv(clip.xy / clip.w) * vec2f(dim) - 0.5;
    let base = floor(x);
    let f = x - base;
    for (var k = 0u; k < 4u; k++) {
        let o = vec2i(i32(k & 1u), i32(k >> 1u));
        let t = vec2i(base) + o;
        if (any(t < vec2i(0)) || any(t >= dim)) { continue; }
        let point = textureLoad(area_shadow_point, t, 0);
        if (point.w <= 0.0) { continue; }
        let d = point.xyz - p;
        if (abs(dot(d, n)) > 0.01 * far + 1.0e-4 || length(d) > 0.05 * far + 1.0e-3) { continue; }
        let w2 = mix(vec2f(1.0) - f, f, vec2f(o));
        taps[k] = vec3f(vec2f(t), w2.x * w2.y + 1.0e-4);
    }
    return taps;
}

/** O canal da luz `light` na sombra das luzes de área, ou −1: não é de área ou está sem sombra. */
fn area_shadow_channel(light: u32) -> i32 {
    let emitter = lights[light];
    if (emitter.kind != 3u || emitter.cones.z < 0.5) { return -1; }
    return i32(emitter.cones.z) - 1;
}
