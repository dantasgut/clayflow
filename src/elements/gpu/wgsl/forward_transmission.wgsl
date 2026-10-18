// Transmissivos (spec 011, R6; spec 034, R1–R2): vidro, líquidos, parede fina e recortes, depois dos opacos. O vértice é
// o do forward (`vs_main`).
//   - o pedido de refração de cada pixel vem antes (`forward_transmission_request.wgsl`) e o estágio de refração traça o
//     raio dele pela estrutura de raios (`refraction_trace.wgsl`);
//   - `fs_transmission_front` (faces da frente, com as amostras do alvo): a luz refletida (`scene_lighting`) mais a
//     transmitida — a radiância traçada do próprio pixel (`refraction_radiance`, nítida em qualquer ampliação), sob o
//     Fresnel e o peso do lobo; sem pedido no pixel (borda de amostra), a cópia da cena no ponto refratado; a opacidade
//     compõe sobre o fundo e a névoa atravessa como antes.
// Requer: forward (vértice, ponto `material`, `scene_lighting`, câmeras); closure_eval; recursos `scene_copy`,
// `scene_copy_sampler`, `refraction_request` e `refraction_radiance`.

// Ponto de mundo → coordenada de tela da cópia (uv em [0, 1], origem em cima).
fn transmission_screen_uv(cam: CameraMatrices, p: vec3f) -> vec2f {
    let clip = cam.viewProjection * vec4f(p, 1.0);
    let ndc = clip.xy / max(clip.w, 1e-6);
    return clamp(vec2f(ndc.x * 0.5 + 0.5, 0.5 - ndc.y * 0.5), vec2f(0.0), vec2f(1.0));
}

// O fundo na tela, no mip da rugosidade (0 = nítido).
fn transmission_background(uv: vec2f, roughness: f32) -> vec3f {
    let levels = f32(textureNumLevels(scene_copy));
    return textureSampleLevel(scene_copy, scene_copy_sampler, uv, roughness * roughness * (levels - 1.0)).rgb;
}

// Luz transmitida no pixel: a radiância traçada pelo estágio de refração (sem pedido, a cópia no ponto refratado a 0,1).
fn transmission_light(c: Closure, cam: CameraMatrices, p: vec3f, n: vec3f, v: vec3f, pixel: vec2u, uv_here: vec2f) -> vec3f {
    var traced = vec3f(0.0);
    let req = textureLoad(refraction_request, vec2i(pixel), 0);
    if (refraction_unpack_tint(req.w).a > 0.0) {
        traced = textureLoad(refraction_radiance, vec2i(pixel), 0).rgb;
    } else {
        let refr = refract(-v, n, 1.0 / max(c.transmission_ior, 1.0));
        let dir = select(-v, refr, dot(refr, refr) > 0.0);
        traced = transmission_background(transmission_screen_uv(cam, p + dir * 0.1), 0.0);
    }
    var out = vec3f(0.0);
    if (closure_has(CLOSURE_TRANSMISSION) && c.transmission_weight > 0.0) {
        out = out + c.transmission_weight * traced;
    }
    if (closure_has(CLOSURE_TRANSLUCENT) && c.translucent_weight > 0.0) {
        out = out + c.translucent_weight * c.translucent_color * traced;
    }
    return out * closure_under_dielectric(c, max(dot(n, v), 1e-4));
}

// Fração do fundo que atravessa a camada (a transmissão e a parede fina, abaixo do dielétrico): o peso de
// `transmission_light` sobre o fundo.
fn transmission_fraction(c: Closure, n: vec3f, v: vec3f) -> vec3f {
    var tau = vec3f(0.0);
    if (closure_has(CLOSURE_TRANSMISSION) && c.transmission_weight > 0.0) {
        tau = tau + c.transmission_weight;
    }
    if (closure_has(CLOSURE_TRANSLUCENT) && c.translucent_weight > 0.0) {
        tau = tau + c.translucent_weight * c.translucent_color;
    }
    return clamp(tau * closure_under_dielectric(c, max(dot(n, v), 1e-4)), vec3f(0.0), vec3f(1.0));
}

@fragment
fn fs_transmission_front(in: VsOut) -> @location(0) vec4f {
    let material = materials[in.material_slot];
    let n = normalize(in.world_normal);
    let variance = bsdf_normal_variance(n);
    let cam = cameras[forward_frame.cameraSlot];
    let sample = SurfaceSample(in.world_position, n, in.uv, forward_frame.time, in.metric, in.curvature, in.principal);
    let c = closure_specular_aa(material_eval(sample, material, in.fn_slot), variance);
    let v = forward_view_dir(cam, in.world_position);
    let pixel = vec2u(in.clip_position.xy);
    let uv = in.clip_position.xy / vec2f(textureDimensions(scene_copy, 0));
    let reflected = scene_lighting(c, in.world_position, n, v) + closure_emitted(c, n, v);
    let transmitted = transmission_light(c, cam, in.world_position, n, v, pixel, uv);
    // Névoa: o fundo lido já a tem até ele; a luz da própria superfície a atravessa até a câmera, e a fração que passa
    // pelo vidro (τ) leva a do fundo em vez da da frente — T·R + τ·B + (1 − τ)·S.
    let fog = scene_fog(in.world_position);
    let tau = transmission_fraction(c, n, v);
    let surface = reflected * fog.a + transmitted + (vec3f(1.0) - tau) * fog.rgb;
    let color = mix(transmission_background(uv, 0.0), surface, c.opacity);
    return vec4f(color, 1.0);
}
