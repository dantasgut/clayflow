// A sombra da luz de área no desenho (spec 013, R5): a fração do retângulo da luz `light` visível do ponto `p`, lida do
// que o `AreaShadowFlow` calculou no quadro anterior. O ponto de mundo volta à tela daquele quadro (a vista-projeção de
// antes) e os quatro texels em volta entram pelo peso bilinear, só os do mesmo ponto da superfície (o plano da normal
// `n` e a distância): a sombra de um ponto parado não depende do quadro, então a leitura não fica atrás da câmera. Sem
// texel que valha (o que acabou de aparecer, o primeiro quadro), um raio ao centro da fonte. A luz sem sombra (o canal
// em `cones.z`: 0), 1.
// Requer: view_space, cameras, lights, ray_scene, area_shadow, area_shadow_output, area_shadow_point.

fn light_visibility(light: u32, p: vec3f, n: vec3f) -> f32 {
    let emitter = lights[light];
    if (emitter.kind != 3u || emitter.cones.z < 0.5) { return 1.0; }
    let channel = u32(emitter.cones.z) - 1u;
    let cam = cameras[area_shadow.camera];
    let far = distance(p, cam.position.xyz);
    let clip = cam.previousViewProjection * vec4f(p, 1.0);
    var sum = 0.0;
    var weight = 0.0;
    if (clip.w > 0.0) {
        let dim = vec2i(textureDimensions(area_shadow_output));
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
            let w = w2.x * w2.y + 1.0e-4;
            sum += w * textureLoad(area_shadow_output, t, 0)[channel];
            weight += w;
        }
    }
    if (weight > 0.0) { return sum / weight; }
    let to = emitter.position.xyz - p;
    let reach = length(to);
    if (reach <= 0.0) { return 1.0; }
    let origin = p + n * (1.0e-3 * far + 1.0e-5);
    return select(1.0, 0.0, ray_scene_occluded(origin, to / reach, reach * 0.999));
}
