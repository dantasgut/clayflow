// O fechamento da água num acerto do campo dos fluidos (spec 034, T065d), comum à contribuição ao ponto
// `ray_volume_closure` e à absorção dos trechos (`ray_volume_transmittance`) —
// a função `material` do corpo (`FluidBody` com `MaterialFunction`, a aparência pelo grafo) pela composição dos acertos
// dos raios (`ray_hit_material`, a mesma das malhas, com as constantes padrão do `StandardMaterial`: o corpo não tem
// material de desenho), ou, sem ela, o do `FluidSurfaceMaterial` (dielétrico de IOR e rugosidade dele, transmissão
// com o Abbe e a absorção por metro — a cor atingida a 1 m —, como a composição da água o desenha).
// Requer: ray_volume_types, fields, field_materials, material_point_types, closure, ray_hit_material.

/** O fechamento do `FluidSurfaceMaterial` `w`. */
fn field_surface_closure(w: FluidSurfaceMaterial) -> Closure {
    let color = exp(-w.absorption.rgb * w.thicknessScale);
    return closure_add(
        closure_dielectric(w.ior, vec3f(1.0), w.roughness, 0.0, vec3f(0.0)),
        closure_transmission(w.ior, color, 1.0, w.abbe, 0.0),
    );
}

/** O fechamento no acerto `hit` do campo (o corpo em `hit.material`) no tempo simulado `time`. */
fn field_closure(hit: RayVolumeHit, time: f32) -> Closure {
    let body = field_body(hit.material);
    if (body.x > 0u) {
        let s = SurfaceSample(
            hit.position,
            hit.normal,
            vec2f(0.0),
            time,
            vec3f(0.0),
            vec4f(0.0),
            vec3f(0.0),
            0.0,
            vec2f(0.0),
            vec2f(0.0),
        );
        let m = StandardMaterial(vec4f(1.0), 0.5, 0.0, 0.0, 0.0);
        return ray_hit_material(body.x, s, m, body.y);
    }
    if (body.z > 0u) { return closure_sanitize(field_surface_closure(field_materials[body.z - 1u])); }
    return closure_zero();
}
