// Contribuição do campo dos fluidos ao ponto `ray_volume_closure` (spec 034, T065d): o fechamento da água no acerto
// (`field_closure`).
// Requer: ray_volume_types, field_closure.

fn ray_volume_closure(hit: RayVolumeHit, time: f32) -> Closure {
    return field_closure(hit, time);
}
