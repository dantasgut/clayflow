// A sombra da luz de área no desenho (spec 013, R5): a fração do retângulo da luz `light` visível do ponto `p`, lida do
// que o `AreaShadowFlow` calculou no quadro anterior (`area_shadow_taps`). Sem texel que valha (o que acabou de
// aparecer, o primeiro quadro), um raio ao centro da fonte. A luz sem sombra, 1.
// Requer: area_shadow_lookup, lights, cameras, ray_scene, area_shadow_output.

fn light_visibility(light: u32, p: vec3f, n: vec3f) -> f32 {
    let channel = area_shadow_channel(light);
    if (channel < 0) { return 1.0; }
    let taps = area_shadow_taps(p, n);
    var sum = 0.0;
    var weight = 0.0;
    for (var k = 0u; k < 4u; k++) {
        if (taps[k].z <= 0.0) { continue; }
        sum += taps[k].z * textureLoad(area_shadow_output, vec2i(taps[k].xy), 0)[channel];
        weight += taps[k].z;
    }
    if (weight > 0.0) { return sum / weight; }
    let emitter = lights[light];
    let to = emitter.position.xyz - p;
    let reach = length(to);
    if (reach <= 0.0) { return 1.0; }
    let far = distance(p, cameras[area_shadow.camera].position.xyz);
    let origin = p + n * (1.0e-3 * far + 1.0e-5);
    return select(1.0, 0.0, ray_scene_occluded(origin, to / reach, reach * 0.999));
}
