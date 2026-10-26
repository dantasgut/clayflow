// Contribuição do campo dos fluidos ao ponto `ray_volume_hit` (spec 033, R11): o cruzamento mais próximo do raio com a
// superfície da água (entrando; com a origem dentro, saindo) pela marcha no campo, com a normal tricúbica e o corpo
// (índice + 1 na tabela `bodies`, o material no contribuinte); a superfície muda nos quadros em que a simulação avança.
// O lado da origem: o conhecido de quem chama (`side` 0 fora, 1 dentro: a partida de uma superfície que ele acabou de
// cruzar ou em que refletiu — a marcha não reacerta essa superfície), ou, desconhecido (−1), o sinal de φ nela.
// Requer: ray_volume_types, fields.

fn ray_volume_hit(origin: vec3f, dir: vec3f, t_max: f32, side: i32) -> RayVolumeHit {
    let none = RayVolumeHit(t_max, origin + dir * t_max, -dir, 0u, false, false, 0u, false);
    let span = field_clip(origin, dir, 0.0, t_max);
    if (span.x >= span.y) { return none; }
    let start = span.x <= 0.0;
    var inside = start && field_phi_at(origin) < 0.0;
    if (side >= 0) { inside = start && side == 1; }
    let h = field_march(origin, dir, span.x, span.y, inside, true, start && side >= 0);
    if (!h.hit) { return none; }
    var body = h.body;
    if (inside) { body = field_body_at(origin); }
    return RayVolumeHit(h.t, h.p, h.n, body, true, inside, 0u, fluid_field.motion.x != 0u);
}
