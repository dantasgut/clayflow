// Contribuição do campo dos fluidos ao ponto `ray_volume_hit` (spec 033, R11): o cruzamento mais próximo do raio com a
// superfície da água — entrando, ou saindo quando a origem está dentro (pela tricúbica no ponto de partida).
// Requer: ray_volume_types, fields, field_ray.

fn ray_volume_hit(origin: vec3f, dir: vec3f, t_max: f32) -> RayVolumeHit {
    let span = field_clip(origin, dir, 0.0, t_max);
    if (span.x <= 0.0 && span.x < span.y && field_phi_at(origin) < 0.0) {
        return field_ray_exit(origin, dir, t_max);
    }
    return field_ray_enter(origin, dir, t_max);
}
