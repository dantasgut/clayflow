// Luz direta no ponto atingido por um raio das sondas (spec 033, R2): a luz que chega de cada fonte do pool
// (`light_incoming`), o meio que ela atravessa (`light_transmission`: a atmosfera para o sol, a água) e a sombra pela
// estrutura de raios (não pelo mapa de sombra: o ponto pode estar fora da vista). Até `GI_EXACT_LIGHTS` luzes vivas,
// todas; acima, uma escolhida entre `GI_LIGHT_CANDIDATES` candidatas pelo peso da resposta sem sombra (amostragem por
// importância reamostrada) — custo fixo com qualquer número de luzes, sem viés. Até `GI_EXACT_LIGHTS` slots, todos.
// Os slots liberados do pool `Light` são zerados (intensidade 0): sem o bitset de vivos, uma ligação de storage a menos.
// Requer: gi, closure, closure_eval, ray_scene, lights, LIGHT_LIMIT, light_incoming, light_transmission.

const GI_EXACT_LIGHTS: u32 = 8u;
const GI_LIGHT_CANDIDATES: u32 = 8u;

fn gi_hash(x: u32) -> u32 {
    var s = x * 747796405u + 2891336453u;
    let w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
    return (w >> 22u) ^ w;
}

/** Rugosidade abaixo da qual vidro e metal fazem cáustica: os fótons levam a luz pelo caminho especular (US5). */
const GI_PHOTON_ROUGH: f32 = 0.3;

/** O fechamento faz cáustica (transmissão ou metal liso, `GI_PHOTON_ROUGH`)? */
fn gi_photon_caustic_capable(c: Closure) -> bool {
    return (c.transmission_weight > 0.5 && c.transmission_roughness < GI_PHOTON_ROUGH)
        || (c.conductor_weight > 0.5 && c.specular_roughness < GI_PHOTON_ROUGH);
}

fn gi_luminance(c: vec3f) -> f32 {
    return dot(c, vec3f(0.2126, 0.7152, 0.0722));
}

/** Resposta do fechamento à luz `i` no ponto, sem a sombra (`shadow = false`) ou com ela. */
fn gi_light_response(c: Closure, i: u32, p: vec3f, n: vec3f, v: vec3f, shadow: bool) -> vec3f {
    let inc = light_incoming(lights[i], p);
    if (all(inc.radiance <= vec3f(0.0)) || dot(n, inc.l) <= 0.0) { return vec3f(0.0); }
    if (shadow && ray_scene_occluded(p + n * 1e-3, inc.l, min(inc.dist, 1e6))) { return vec3f(0.0); }
    return closure_eval(c, n, v, inc.l, inc.radiance * light_transmission(i, p));
}

fn gi_direct(c: Closure, p: vec3f, n: vec3f, v: vec3f, seed: u32) -> vec3f {
    // Os slots usados do pool (não a capacidade do buffer, que tem a folga do crescimento).
    let count = min(min(gi.counts.x, arrayLength(&lights)), LIGHT_LIMIT);
    if (count <= GI_EXACT_LIGHTS) {
        var sum = vec3f(0.0);
        for (var i = 0u; i < count; i++) { sum += gi_light_response(c, i, p, n, v, true); }
        return sum;
    }
    // Reamostragem: candidatas uniformes nos slots, peso = luminância da resposta sem sombra.
    var chosen = NONE;
    var chosen_w = 0.0;
    var total = 0.0;
    var h = gi_hash(seed);
    for (var k = 0u; k < GI_LIGHT_CANDIDATES; k++) {
        h = gi_hash(h + k);
        let i = h % count;
        let w = gi_luminance(gi_light_response(c, i, p, n, v, false)) * f32(count);
        total += w;
        h = gi_hash(h);
        if (w > 0.0 && f32(h & 0xFFFFu) / 65536.0 * total < w) {
            chosen = i;
            chosen_w = w / f32(count);
        }
    }
    if (chosen == NONE || chosen_w <= 0.0) { return vec3f(0.0); }
    return gi_light_response(c, chosen, p, n, v, true) / chosen_w * (total / f32(GI_LIGHT_CANDIDATES));
}
