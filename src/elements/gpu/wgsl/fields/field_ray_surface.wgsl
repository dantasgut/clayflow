// Contribuição do campo dos fluidos ao ponto `ray_volume_surface` (spec 034, T065d): o material da água no acerto
// (`field_surface`).
// Requer: ray_volume_types, field_surface.

fn ray_volume_surface(hit: RayVolumeHit) -> RayVolumeSurface {
    return field_surface(hit);
}
