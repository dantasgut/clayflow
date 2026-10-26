// O material de um corpo do campo sem função `material`, sem corpos de `FluidSurfaceMaterial` na cena (spec 034,
// T065d): nenhum. A variante com eles é `field_surface_fluid.wgsl`.
// Requer: ray_volume_types, closure.

fn field_surface_fallback(body: vec4u) -> RayVolumeSurface {
    return RayVolumeSurface(0u, 0u, closure_zero());
}
