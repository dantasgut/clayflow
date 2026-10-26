// O material de um corpo do campo sem função `material`, com corpos de `FluidSurfaceMaterial` na cena (spec 034,
// T065d): o fechamento dele — dielétrico de IOR e rugosidade dele, transmissão com o Abbe e a absorção por metro (a
// cor atingida a 1 m), como a composição da água o desenha. Sai com o `FluidSurfaceMaterial` (T066).
// Requer: ray_volume_types, field_materials, closure.

/** O fechamento do `FluidSurfaceMaterial` `w`. */
fn field_surface_closure(w: FluidSurfaceMaterial) -> Closure {
    let color = exp(-w.absorption.rgb * w.thicknessScale);
    return closure_add(
        closure_dielectric(w.ior, vec3f(1.0), w.roughness, 0.0, vec3f(0.0)),
        closure_transmission(w.ior, color, 1.0, w.abbe, 0.0),
    );
}

fn field_surface_fallback(body: vec4u) -> RayVolumeSurface {
    if (body.z == 0u) { return RayVolumeSurface(0u, 0u, closure_zero()); }
    return RayVolumeSurface(0u, 0u, closure_sanitize(field_surface_closure(field_materials[body.z - 1u])));
}
