// Pedidos de refração da água (spec 034, R6): um triângulo de tela cheia que grava, em cada pixel com água, o pedido do
// traçado — a normal da superfície com as ondulações, o IOR efetivo (`fluid_refraction_ior`), o Abbe e a absorção do
// material — e a distância da câmera ao ponto. O traçado é o mesmo do vidro
// (`refraction_trace_main.wgsl`, `refraction_shade.wgsl`).
// Requer: water_point, refraction_codec, fluid_refraction_ior, cameras, water_materials, water_composite.

struct WaterRequestOut {
    @location(0) request: vec4u,
    @location(1) distance: f32,
}

@fragment
fn water_request_fs(@builtin(position) frag: vec4f) -> WaterRequestOut {
    let w = water_point(vec2i(frag.xy));
    if (!w.valid) { discard; }
    let material = water_materials[w.material - 1u];
    let cam = cameras[water_composite.cameraSlot];
    var out: WaterRequestOut;
    // A absorção da água como a cor atingida a 1 m de percurso (o pedido guarda cor e distância, como o vidro).
    let per_meter = exp(-max(material.absorption.rgb, vec3f(0.0)) * material.thicknessScale);
    out.request = refraction_request_of(w.normal, fluid_refraction_ior(material), material.abbe, 0.0, REFRACTION_VOLUME, per_meter, 1.0, 1.0);
    out.distance = refraction_ray_distance(cam, w.position);
    return out;
}
