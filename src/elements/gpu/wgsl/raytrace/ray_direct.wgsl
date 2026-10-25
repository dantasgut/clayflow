// Luz direta num ponto atingido por um raio (spec 033 R2, comum na spec 034): a luz que chega de cada fonte do pool
// (`light_incoming`), o meio que ela atravessa (`light_transmission`: a atmosfera para o sol, a água) e a sombra pela
// estrutura de raios (não pelo mapa de sombra: o ponto pode estar fora da vista). Até `RAY_EXACT_LIGHTS` luzes, todas;
// acima, uma escolhida entre `RAY_LIGHT_CANDIDATES` candidatas pelo peso da resposta sem sombra (amostragem por
// importância reamostrada) — custo fixo com qualquer número de luzes, sem viés. Os slots liberados do pool `Light` são
// zerados (intensidade 0): sem o bitset de vivos, uma ligação de storage a menos. Quem consome: a iluminação global e a
// refração, cada uma com a contagem de slots usados do pool que escreve no próprio uniform. `ray_direct_marked` diz
// também se um raio de sombra parou numa instância que se moveu desde o quadro anterior (a sombra pode mudar sem que
// nada mude no ponto: quem guarda histórico — o filtro da refração — encurta-o por essa marca).
// Requer: NONE, closure, closure_eval, ray_scene, ray_bvh_read, lights, LIGHT_LIMIT, light_incoming,
// light_transmission.

const RAY_EXACT_LIGHTS: u32 = 8u;
const RAY_LIGHT_CANDIDATES: u32 = 8u;

/**
 * Resposta do fechamento à luz `i` no ponto (rgb), sem a sombra (`shadow = false`) ou com ela; no w, 1 quando o raio de
 * sombra parou numa instância que se moveu (o primeiro bloqueio achado: com outro bloqueio parado, a luz segue tapada
 * quando ela se move, e a marca não faz falta).
 */
fn ray_light_response(c: Closure, i: u32, p: vec3f, n: vec3f, v: vec3f, shadow: bool) -> vec4f {
    let inc = light_incoming(lights[i], p);
    if (all(inc.radiance <= vec3f(0.0)) || dot(n, inc.l) <= 0.0) { return vec4f(0.0); }
    if (shadow) {
        let blocker = ray_scene_trace(p + n * 1e-3, inc.l, min(inc.dist, 1e6), true, NONE).instance;
        if (blocker != NONE) {
            let moved = ray_instance_moved_at(ray_scene_info.instanceFirst + blocker * RAY_INSTANCE_WORDS);
            return vec4f(0.0, 0.0, 0.0, select(0.0, 1.0, moved));
        }
    }
    return vec4f(closure_eval(c, n, v, inc.l, inc.radiance * light_transmission(i, p)), 0.0);
}

/** Luz direta refletida para `v` pelas `used` primeiras posições do pool de luzes, com sombra. */
fn ray_direct(c: Closure, p: vec3f, n: vec3f, v: vec3f, used: u32, seed: u32) -> vec3f {
    return ray_direct_marked(c, p, n, v, used, seed).xyz;
}

/** A luz direta (rgb) e, no w, 1 quando um raio de sombra parou numa instância que se moveu. */
fn ray_direct_marked(c: Closure, p: vec3f, n: vec3f, v: vec3f, used: u32, seed: u32) -> vec4f {
    // Os slots usados do pool (não a capacidade do buffer, que tem a folga do crescimento).
    let count = min(min(used, arrayLength(&lights)), LIGHT_LIMIT);
    if (count <= RAY_EXACT_LIGHTS) {
        var sum = vec4f(0.0);
        for (var i = 0u; i < count; i++) {
            let r = ray_light_response(c, i, p, n, v, true);
            sum = vec4f(sum.xyz + r.xyz, max(sum.w, r.w));
        }
        return sum;
    }
    // Reamostragem: candidatas uniformes nos slots, peso = luminância da resposta sem sombra.
    var chosen = NONE;
    var chosen_w = 0.0;
    var total = 0.0;
    var h = pcg_hash(seed);
    for (var k = 0u; k < RAY_LIGHT_CANDIDATES; k++) {
        h = pcg_hash(h + k);
        let i = h % count;
        let w = luminance(ray_light_response(c, i, p, n, v, false).xyz) * f32(count);
        total += w;
        h = pcg_hash(h);
        if (w > 0.0 && f32(h & 0xFFFFu) / 65536.0 * total < w) {
            chosen = i;
            chosen_w = w / f32(count);
        }
    }
    if (chosen == NONE || chosen_w <= 0.0) { return vec4f(0.0); }
    let r = ray_light_response(c, chosen, p, n, v, true);
    return vec4f(r.xyz / chosen_w * (total / f32(RAY_LIGHT_CANDIDATES)), r.w);
}
