// Transmissivos (spec 011, R6; spec 034, US7): vidro, líquidos, parede fina e recortes, em duas camadas depois dos
// opacos. O vértice é o do forward (`vs_main`).
//   - A luz que atravessa o material transmissivo é a refração traçada (`scene_refraction`): o caminho pela estrutura de
//     raios até uma superfície que não transmite, com as interfaces seguintes, a absorção, a dispersão e a luz de trás —
//     nunca a cópia da tela. Sem ela (os kernels ainda compilando), o vidro mostra só o reflexo.
//   - A parede fina (translúcido) espalha o fundo sem refratar: a cópia da cena com mips (`scene_copy`, já em HDR), num
//     mip alto; a opacidade (recorte) compõe sobre o fundo na tela — o que de fato está atrás, sem desvio.
//   - `fs_transmission_back` (faces de trás, primeira camada: a mais distante por pixel, à frente dos opacos) e
//     `fs_transmission_front` (faces da frente, sobre a cópia refeita com a de trás): a luz refletida (`scene_lighting`)
//     mais a transmitida; a distância da face de trás (alvo `r16float`) fica para a névoa.
// Requer: forward (vértice, ponto `material`, `scene_lighting`, câmeras); closure_eval; scene_refraction; recursos
// `scene_copy`, `scene_copy_sampler`, `transmission_depth` e `scene_depth` (a profundidade dos opacos, com ou sem
// amostras).

// O fundo na tela, no mip da rugosidade (0 = nítido).
fn transmission_background(uv: vec2f, roughness: f32) -> vec3f {
    let levels = f32(textureNumLevels(scene_copy));
    return textureSampleLevel(scene_copy, scene_copy_sampler, uv, roughness * roughness * (levels - 1.0)).rgb;
}

// Luz transmitida pela camada: a refração traçada no pixel (`traced`, a radiância por baixo da primeira interface) e a
// parede fina (o fundo espalhado, mip alto, sem deslocamento), abaixo do Fresnel do dielétrico.
fn transmission_light(c: Closure, n: vec3f, v: vec3f, uv_here: vec2f, traced: vec4f) -> vec3f {
    var out = vec3f(0.0);
    if (closure_has(CLOSURE_TRANSMISSION) && c.transmission_weight > 0.0) {
        out = out + c.transmission_weight * traced.rgb;
    }
    if (closure_has(CLOSURE_TRANSLUCENT) && c.translucent_weight > 0.0) {
        out = out + c.translucent_weight * c.translucent_color * transmission_background(uv_here, 0.8);
    }
    return out * closure_under_dielectric(c, max(dot(n, v), 1e-4));
}

// Fração do fundo que atravessa a camada (a transmissão e a parede fina, abaixo do dielétrico): o que a névoa da frente
// troca pela do fundo.
fn transmission_fraction(c: Closure, n: vec3f, v: vec3f) -> vec3f {
    var tau = vec3f(0.0);
    if (closure_has(CLOSURE_TRANSMISSION) && c.transmission_weight > 0.0) {
        tau = tau + vec3f(c.transmission_weight);
    }
    if (closure_has(CLOSURE_TRANSLUCENT) && c.translucent_weight > 0.0) {
        tau = tau + c.translucent_weight * c.translucent_color;
    }
    return clamp(tau * closure_under_dielectric(c, max(dot(n, v), 1e-4)), vec3f(0.0), vec3f(1.0));
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
    // A câmera vê a face de trás (dentro do material, ou a de trás de uma camada sem frente): a refração traçada no pixel
    // a partir dela; a parede fina, o fundo espalhado.
    let light = transmission_light(c, n, v, uv, scene_refraction(vec2u(in.clip_position.xy)));
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
    let reflected = scene_lighting(c, in.world_position, n, v) + closure_emitted(c, n, v);
    let transmitted = transmission_light(c, n, v, uv, scene_refraction(pixel));
    // Névoa: o fundo traçado já a tem até ele (`scene_fog` no acerto de trás); a luz da própria superfície a atravessa até
    // a câmera, e a fração que passa pelo vidro (τ) leva a do fundo em vez da da frente — T·R + τ·B + (1 − τ)·S.
    let fog = scene_fog(in.world_position);
    let tau = transmission_fraction(c, n, v);
    let surface = reflected * fog.a + transmitted + (vec3f(1.0) - tau) * fog.rgb;
    let color = mix(transmission_background(uv, 0.0), surface, c.opacity);
    return vec4f(color, 1.0);
}
