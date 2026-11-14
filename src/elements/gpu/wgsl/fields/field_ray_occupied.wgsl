// Contribuição do campo dos fluidos ao ponto `ray_volume_occupied` (spec 034, T067c): o raio passa por algum bloco do
// campo — fora dos blocos φ é vazio, a superfície só existe neles. Pelos superblocos e blocos ao longo do raio (os
// vazios pulados até a saída deles, como na marcha), sem amostrar φ; no teto de passos, verdadeiro (conservador).
// Requer: fields.

fn ray_volume_occupied(origin: vec3f, dir: vec3f, t_max: f32) -> bool {
    let span = field_clip(origin, dir, 0.0, t_max);
    if (span.x >= span.y) { return false; }
    let super_size = 4.0 * field_brick_size();
    var t = span.x;
    for (var k = 0u; k < 256u; k++) {
        if (t > span.y) { return false; }
        let p = origin + dir * t;
        let b = field_brick_of(p);
        let sb = field_super_of(b);
        if (!field_super_present(sb)) {
            t += field_cell_exit(vec3f(sb) * super_size, super_size, p, dir) + 1e-4;
            continue;
        }
        if (field_find(b) != NONE) { return true; }
        t += field_brick_exit(b, p, dir) + 1e-4;
    }
    return true;
}
