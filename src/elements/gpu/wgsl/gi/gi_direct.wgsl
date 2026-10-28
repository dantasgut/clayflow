// Luz direta no ponto atingido por um raio das sondas (spec 033, R2): a do módulo comum da estrutura de raios
// (`ray_direct`) pelos slots usados do pool de luzes (`gi.counts.x`), mais o hash e a luminância dos raios da GI.
// Requer: gi, ray_direct.

fn gi_direct(c: Closure, p: vec3f, n: vec3f, v: vec3f, seed: u32) -> vec3f {
    return ray_direct(c, p, n, v, gi.counts.x, seed);
}
