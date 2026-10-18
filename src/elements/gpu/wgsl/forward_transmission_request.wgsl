// Pedidos de refração (spec 034, R2): as faces da frente dos materiais com transmissão, sem amostras, com profundidade
// própria `less` e à frente dos opacos pela profundidade da cena, gravam o pedido do pixel — normal do lobo, IOR e Abbe,
// rugosidade (negativa = parede fina), cor e distância da absorção e peso (`refraction_request`, rgba32uint) — e a
// distância da câmera ao ponto (`refraction_distance`, r32float). O estágio de refração traça o raio de cada pedido
// (`refraction_trace.wgsl`). O vértice é o do forward (`vs_main`).
// Requer: forward (vértice, ponto `material`, câmeras); closure_eval; refraction_request; recurso `scene_depth` (com ou
// sem amostras).

struct TransmissionRequestOut {
    @location(0) request: vec4u,
    @location(1) distance: f32,
}

@fragment
fn fs_transmission_request(in: VsOut) -> TransmissionRequestOut {
    // Atrás de um opaco: sem pedido (a profundidade própria guarda a face da frente mais próxima).
    if (in.clip_position.z >= textureLoad(scene_depth, vec2i(in.clip_position.xy), 0)) { discard; }
    let material = materials[in.material_slot];
    let n = normalize(in.world_normal);
    let cam = cameras[forward_frame.cameraSlot];
    let sample = SurfaceSample(in.world_position, n, in.uv, forward_frame.time, in.metric, in.curvature, in.principal);
    let c = material_eval(sample, material, in.fn_slot);
    let v = forward_view_dir(cam, in.world_position);
    let nl = closure_lobe_normal(c.normal, n, v);
    let thin = c.transmission_weight <= 0.0;
    let weight = clamp(c.transmission_weight + c.translucent_weight, 0.0, 1.0);
    var out: TransmissionRequestOut;
    out.request = refraction_request_of(
        nl,
        c.transmission_ior,
        c.transmission_abbe,
        c.transmission_roughness,
        select(0.0, REFRACTION_THIN, thin),
        c.transmission_color,
        c.transmission_depth,
        weight,
    );
    out.distance = refraction_ray_distance(cam, in.world_position);
    return out;
}
