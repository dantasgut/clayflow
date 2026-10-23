// Luz direta no ponto atingido por um raio das sondas (spec 033, R2): a do módulo comum da estrutura de raios
// (`ray_direct`) pelos slots usados do pool de luzes (`gi.counts.x`), mais o hash e a luminância dos raios da GI e o
// teste das cáusticas por fótons.
// Requer: gi, ray_direct.

fn gi_hash(x: u32) -> u32 {
    return ray_direct_hash(x);
}

/** Rugosidade abaixo da qual vidro e metal fazem cáustica: os fótons levam a luz pelo caminho especular (US5). */
const GI_PHOTON_ROUGH: f32 = 0.3;

/** O fechamento faz cáustica (transmissão ou metal liso, `GI_PHOTON_ROUGH`)? */
fn gi_photon_caustic_capable(c: Closure) -> bool {
    return (c.transmission_weight > 0.5 && c.transmission_roughness < GI_PHOTON_ROUGH)
        || (c.conductor_weight > 0.5 && c.specular_roughness < GI_PHOTON_ROUGH);
}

fn gi_luminance(c: vec3f) -> f32 {
    return ray_direct_luminance(c);
}

fn gi_direct(c: Closure, p: vec3f, n: vec3f, v: vec3f, seed: u32) -> vec3f {
    return ray_direct(c, p, n, v, gi.counts.x, seed);
}
