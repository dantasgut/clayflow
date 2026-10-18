// Transmissivos (spec 011, R6): vidro, líquidos, parede fina e recortes, em duas camadas depois dos opacos. O vértice é o
// do forward (`vs_main`); os fragmentos leem a cópia da cena com mips (`scene_copy`, o que está atrás, já em HDR).
//   - `fs_transmission_back` (faces de trás, primeira camada, descascada: a mais distante por pixel, pela profundidade
//     própria com teste `greater`, à frente dos opacos pela profundidade da cena): o fundo visto pela saída do material,
//     atenuado pela corda do objeto (Beer-Lambert), e a distância da câmera à face (alvo `r16float`) — a espessura que a
//     camada da frente atravessa.
//   - `fs_transmission_front` (faces da frente, segunda camada, sobre a cópia refeita com a de trás): a luz refletida
//     (`scene_lighting`) mais a transmitida — o raio refratado pelo IOR percorre a espessura até a saída, projetado na
//     tela e lido no mip da rugosidade; Beer-Lambert pela cor e a distância do lobo; dispersão por canal pelo número de
//     Abbe; a parede fina sem refração; a opacidade compõe sobre o fundo.
// Aproximação documentada: a refração é no espaço da tela (sem traçado de raios em hardware no WebGPU) e, de 3 camadas em
// diante, a terceira só aparece pela cópia.
// A corda da absorção é a de um objeto convexo simétrico em torno da sua origem (exata em esferas e caixas de frente).
// Requer: forward (vértice, ponto `material`, `scene_lighting`, câmeras); closure_eval; recursos `scene_copy`,
// `scene_copy_sampler`, `transmission_depth` e `scene_depth` (a profundidade dos opacos, com ou sem amostras).

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

// Luz transmitida pela camada no ponto `p` (normal `n`, observador `v`), atravessando `thickness` unidades até a saída.
fn transmission_light(c: Closure, cam: CameraMatrices, p: vec3f, n: vec3f, v: vec3f, thickness: f32, uv_here: vec2f, absorb_path: f32) -> vec3f {
    var out = vec3f(0.0);
    if (closure_has(CLOSURE_TRANSMISSION) && c.transmission_weight > 0.0) {
        // IOR por canal (R, G, B) pelo número de Abbe.
        let iors = closure_dispersion_iors(c.transmission_ior, c.transmission_abbe);
        var bg = vec3f(0.0);
        for (var k = 0; k < 3; k = k + 1) {
            let refr = refract(-v, n, 1.0 / iors[k]);
            let dir = select(-v, refr, dot(refr, refr) > 0.0);
            let uv = transmission_screen_uv(cam, p + dir * thickness);
            bg[k] = transmission_background(uv, c.transmission_roughness)[k];
        }
        out = out + c.transmission_weight * transmission_absorb(c, absorb_path) * bg;
    }
    if (closure_has(CLOSURE_TRANSLUCENT) && c.translucent_weight > 0.0) {
        // Parede fina: o fundo espalhado (mip alto), sem deslocamento.
        out = out + c.translucent_weight * c.translucent_color * transmission_background(uv_here, 0.8);
    }
    return out * closure_under_dielectric(c, max(dot(n, v), 1e-4));
}

// Fração do fundo que atravessa a camada (a transmissão e a parede fina, abaixo do dielétrico): o peso de
// `transmission_light` sobre o fundo.
fn transmission_fraction(c: Closure, n: vec3f, v: vec3f, absorb_path: f32) -> vec3f {
    var tau = vec3f(0.0);
    if (closure_has(CLOSURE_TRANSMISSION) && c.transmission_weight > 0.0) {
        tau = tau + c.transmission_weight * transmission_absorb(c, absorb_path);
    }
    if (closure_has(CLOSURE_TRANSLUCENT) && c.translucent_weight > 0.0) {
        tau = tau + c.translucent_weight * c.translucent_color;
    }
    return clamp(tau * closure_under_dielectric(c, max(dot(n, v), 1e-4)), vec3f(0.0), vec3f(1.0));
}

// Beer-Lambert: a cor do lobo atingida a `depth` unidades de percurso, elevada à razão do percurso `path`.
fn transmission_absorb(c: Closure, path: f32) -> vec3f {
    return select(
        vec3f(1.0),
        pow(max(c.transmission_color, vec3f(1e-4)), vec3f(max(path, 0.0) / max(c.transmission_depth, 1e-6))),
        c.transmission_depth > 0.0,
    );
}

// Distância da câmera ao ponto (a profundidade das camadas).
fn transmission_distance(cam: CameraMatrices, p: vec3f) -> f32 {
    return distance(cam.position.xyz, p);
}

struct TransmissionBackOut {
    @location(0) color: vec4f,
    @location(1) distance: f32,
}

@fragment
fn fs_transmission_back(in: VsOut) -> TransmissionBackOut {
    // Atrás de um opaco: não é camada (a profundidade própria guarda a face de trás mais distante à frente dos opacos).
    if (in.clip_position.z >= textureLoad(scene_depth, vec2i(in.clip_position.xy), 0)) { discard; }
    let material = materials[in.material_slot];
    let cam = cameras[forward_frame.cameraSlot];
    // Face de trás: a normal voltada para dentro do material (para o observador).
    let n = -normalize(in.world_normal);
    let sample = SurfaceSample(in.world_position, n, in.uv, forward_frame.time, in.metric, in.curvature, in.principal);
    let c = material_eval(sample, material, in.fn_slot);
    let v = forward_view_dir(cam, in.world_position);
    let uv = in.clip_position.xy / vec2f(textureDimensions(scene_copy, 0));
    // Saída do material (vidro → ar): o fundo logo atrás, refratado pelo IOR na saída; a parede fina, espalhado.
    let thickness = select(0.1, c.transmission_depth, c.transmission_depth > 0.0);
    var light = vec3f(0.0);
    if (closure_has(CLOSURE_TRANSMISSION) && c.transmission_weight > 0.0) {
        let refr = refract(-v, n, c.transmission_ior);
        let dir = select(reflect(-v, n), refr, dot(refr, refr) > 0.0);
        let exit = transmission_screen_uv(cam, in.world_position + dir * thickness);
        // A corda do objeto ao longo da vista (da origem até a face de trás, duas vezes).
        let chord = 2.0 * max(dot(in.world_position - in.origin, -v), 0.0);
        light = light + c.transmission_weight * transmission_absorb(c, chord)
            * transmission_background(exit, c.transmission_roughness);
    }
    if (closure_has(CLOSURE_TRANSLUCENT) && c.translucent_weight > 0.0) {
        light = light + c.translucent_weight * c.translucent_color * transmission_background(uv, 0.8);
    }
    let color = mix(transmission_background(uv, 0.0), light, c.opacity);
    var out: TransmissionBackOut;
    out.color = vec4f(color, 1.0);
    out.distance = transmission_distance(cam, in.world_position);
    return out;
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
    // Espessura: a corda do próprio objeto ao longo da vista (da face da frente à de trás, simétrica pela origem); sem
    // corda, a distância do lobo. A face de trás desenhada é a dele quando fica a essa distância: a absorção já está
    // nela; senão (a de trás é de outro objeto, ou não há), a absorção é aplicada aqui.
    let here = transmission_distance(cam, in.world_position);
    let back = textureLoad(transmission_depth, pixel, 0).r;
    let chord = 2.0 * max(dot(in.origin - in.world_position, -v), 0.0);
    let thickness = select(select(0.1, c.transmission_depth, c.transmission_depth > 0.0), chord, chord > 1e-4);
    let own_back = chord > 1e-4 && abs(back - (here + chord)) <= 0.05 * chord + 1e-3;
    let reflected = scene_lighting(c, in.world_position, n, v) + closure_emitted(c, n, v);
    let absorb_path = select(thickness, 0.0, own_back);
    let transmitted = transmission_light(c, cam, in.world_position, n, v, thickness, uv, absorb_path);
    // Névoa: o fundo lido já a tem até ele; a luz da própria superfície a atravessa até a câmera, e a fração que passa
    // pelo vidro (τ) leva a do fundo em vez da da frente — T·R + τ·B + (1 − τ)·S.
    let fog = scene_fog(in.world_position);
    let tau = transmission_fraction(c, n, v, absorb_path);
    let surface = reflected * fog.a + transmitted + (vec3f(1.0) - tau) * fog.rgb;
    let color = mix(transmission_background(uv, 0.0), surface, c.opacity);
    return vec4f(color, 1.0);
}
