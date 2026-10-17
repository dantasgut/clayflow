// Contribuição do campo dos fluidos ao ponto `ray_volume_hit` (spec 033, R11): o cruzamento mais próximo do raio com a
// superfície da água (entrando; com a origem dentro, saindo) pela marcha no campo, com a normal tricúbica e o material.
// Requer: ray_volume_types, fields.

fn ray_volume_hit(origin: vec3f, dir: vec3f, t_max: f32) -> RayVolumeHit {
    let none = RayVolumeHit(t_max, origin + dir * t_max, -dir, 0u, false, false);
    let span = field_clip(origin, dir, 0.0, t_max);
    if (span.x >= span.y) { return none; }
    let inside = span.x <= 0.0 && field_phi_at(origin) < 0.0;
    let h = field_march(origin, dir, span.x, span.y, inside, true);
    if (!h.hit) { return none; }
    var material = h.material;
    if (inside) { material = field_material_at(origin); }
    return RayVolumeHit(h.t, h.p, h.n, material, true, inside);
}
