// Refração traçada (spec 034, US7; R15): por pixel, o raio da câmera ativa; se a primeira superfície é transmissiva, o
// caminho da luz que a atravessa pela estrutura de raios até uma superfície que não transmite — sem a cópia da tela.
//   - na primeira interface o raio refrata (o reflexo dela é do desenho), com a micro-normal pela GGX (VNDF) na rugosidade
//     da transmissão; reflexão interna total na entrada não traz nada por baixo (o desenho dá o reflexo);
//   - nas seguintes, Fresnel exato escolhe entre refletir e refratar (o reflexo das faces atravessadas é um raio
//     traçado), Beer–Lambert pelo trecho dentro de cada meio, até `GI_REFRACTION_INTERFACES` interfaces;
//   - na superfície que não transmite, a mesma luz que o desenho daria a ela (`scene_lighting` + emissão), com a névoa
//     da câmera até ela (`scene_fog`); sem acerto, o ambiente (`scene_environment`);
//   - com número de Abbe, um raio por canal, cada um com o IOR do seu canal e iluminado no próprio acerto.
// O resultado (a radiância logo abaixo da primeira interface, sem o Fresnel dela, que é do desenho), de um ponto sorteado
// no pixel a cada quadro, entra numa média temporal reprojetada pelo primeiro acerto: a rugosidade, as escolhas de
// Fresnel e a área do pixel (o antisserrilhado) convergem, sem desfoque.
// Saída `gi_refraction_out` (rgb, a = 1 onde o primeiro acerto é transmissivo); o histórico tem duas metades
// alternadas (`gi.screen1.y`) depois do cabeçalho com a vista-projeção anterior.
// Requer: WORKGROUP_SIZE, NONE, gi, gi_common, gi_screen_common, cameras, ray_scene, gi_hit, closure_eval,
// scene_lighting, scene_environment, scene_fog, gi_refraction_history, gi_refraction_out.

/** Interfaces no máximo por caminho (um vidro com faces internas, uma pilha de placas). */
const GI_REFRACTION_INTERFACES: u32 = 24u;
/** vec4f do cabeçalho do histórico: a vista-projeção do quadro anterior. */
const GI_REFRACTION_HEADER: u32 = 4u;
/** Quadros no máximo da média temporal (parado, a imagem converge até eles). */
const GI_REFRACTION_HISTORY: f32 = 64.0;

/** Pixels do alvo (o histórico guarda um por pixel em cada metade). */
fn gi_refraction_pixels() -> u32 {
    return u32(gi.screenSize.x) * u32(gi.screenSize.y);
}

/** Índice no histórico do pixel `p` na metade `half`. */
fn gi_refraction_at(half: u32, p: u32) -> u32 {
    return GI_REFRACTION_HEADER + half * gi_refraction_pixels() + p;
}

/** Refletância de Fresnel sem polarização de uma interface `n1` → `n2` com o cosseno de incidência `cosi`. */
fn gi_refraction_fresnel(cosi: f32, n1: f32, n2: f32) -> f32 {
    let sint2 = (n1 / n2) * (n1 / n2) * max(0.0, 1.0 - cosi * cosi);
    if (sint2 >= 1.0) { return 1.0; }
    let cost = sqrt(1.0 - sint2);
    let rs = (n1 * cosi - n2 * cost) / (n1 * cosi + n2 * cost);
    let rp = (n2 * cosi - n1 * cost) / (n2 * cosi + n1 * cost);
    return 0.5 * (rs * rs + rp * rp);
}

/** Máscara de Smith da GGX (α) para o cosseno `c` com a normal. */
fn gi_refraction_g1(c: f32, alpha: f32) -> f32 {
    let x = clamp(abs(c), 1e-6, 1.0);
    let tan2 = (1.0 - x * x) / (x * x);
    return 2.0 / (1.0 + sqrt(1.0 + alpha * alpha * tan2));
}

/** Base ortonormal em volta de `n` (Duff et al. 2017). */
fn gi_refraction_basis(n: vec3f) -> mat3x3f {
    let s = select(-1.0, 1.0, n.z >= 0.0);
    let a = -1.0 / (s + n.z);
    let b = n.x * n.y * a;
    return mat3x3f(vec3f(1.0 + s * n.x * n.x * a, s * b, -s * n.x), vec3f(b, s + n.y * n.y * a, -n.y), n);
}

/** Micro-normal visível da GGX (Heitz 2018) vista de `wo` (do lado de `n`), α isotrópico; `u` uniforme em [0, 1)². */
fn gi_refraction_ggx(n: vec3f, wo: vec3f, alpha: f32, u: vec2f) -> vec3f {
    if (alpha < 1e-4) { return n; }
    let basis = gi_refraction_basis(n);
    let lo = transpose(basis) * wo;
    let vh = normalize(vec3f(alpha * lo.x, alpha * lo.y, lo.z));
    let lensq = vh.x * vh.x + vh.y * vh.y;
    let t1 = select(vec3f(1.0, 0.0, 0.0), vec3f(-vh.y, vh.x, 0.0) / sqrt(lensq), lensq > 0.0);
    let t2 = cross(vh, t1);
    let r = sqrt(u.x);
    let phi = 2.0 * GI_PI * u.y;
    let p1 = r * cos(phi);
    let s = 0.5 * (1.0 + vh.z);
    let p2 = (1.0 - s) * sqrt(max(0.0, 1.0 - p1 * p1)) + s * r * sin(phi);
    let nh = p1 * t1 + p2 * t2 + sqrt(max(0.0, 1.0 - p1 * p1 - p2 * p2)) * vh;
    return normalize(basis * normalize(vec3f(alpha * nh.x, alpha * nh.y, max(0.0, nh.z))));
}

/** Uniforme em [0, 1) do estado (hash PCG encadeado). */
fn gi_refraction_random(state: ptr<function, u32>) -> f32 {
    *state = gi_hash(*state);
    return f32(*state >> 8u) / 16777216.0;
}

/** O IOR do canal `ch` (0–2; 3 = sem dispersão) do fechamento. */
fn gi_refraction_ior(c: Closure, ch: u32) -> f32 {
    if (ch > 2u || c.transmission_abbe <= 0.0) { return c.transmission_ior; }
    return closure_dispersion_iors(c.transmission_ior, c.transmission_abbe)[ch];
}

/** O meio em que o raio está: a cor atingida a `depth` de percurso (Beer–Lambert); depth 0 = sem absorção. */
struct GiRefractionMedium {
    color: vec3f,
    depth: f32,
}

/** O meio depois de refratar: o do material ao entrar (`outside`), nenhum ao sair. */
fn gi_refraction_medium(c: Closure, outside: bool) -> GiRefractionMedium {
    if (outside) { return GiRefractionMedium(c.transmission_color, c.transmission_depth); }
    return GiRefractionMedium(vec3f(1.0), 0.0);
}

/** A fração que atravessa `t` unidades do meio. */
fn gi_refraction_absorb(m: GiRefractionMedium, t: f32) -> vec3f {
    if (m.depth <= 0.0) { return vec3f(1.0); }
    return pow(max(m.color, vec3f(1e-4)), vec3f(max(t, 0.0) / m.depth));
}

/**
 * A radiância que chega pela direção `dir` a partir de `origin`, no meio `medium`, no canal `ch` (3 = todos), até uma
 * superfície que não transmite (as interfaces do caminho por Fresnel exato).
 */
fn gi_refraction_trace(origin: vec3f, dir: vec3f, medium_in: GiRefractionMedium, ch: u32, state: ptr<function, u32>) -> vec3f {
    let max_dist = gi.tuning.w * 4.0;
    var o = origin;
    var d = dir;
    var medium = medium_in;
    var throughput = vec3f(1.0);
    for (var k = 0u; k < GI_REFRACTION_INTERFACES; k++) {
        let hit = ray_scene_hit(o, d, max_dist);
        throughput *= gi_refraction_absorb(medium, min(hit.t, max_dist));
        if (hit.t >= max_dist || hit.instance == NONE) { return throughput * scene_environment(d); }
        let c = gi_hit_closure(hit);
        let outside = hit.face >= 0.0;
        let n = select(-hit.normal, hit.normal, outside);
        if (c.transmission_weight > 0.5) {
            let ior = gi_refraction_ior(c, ch);
            let n1 = select(ior, 1.0, outside);
            let n2 = select(1.0, ior, outside);
            let alpha = c.transmission_roughness * c.transmission_roughness;
            let m = gi_refraction_ggx(n, -d, alpha, vec2f(gi_refraction_random(state), gi_refraction_random(state)));
            let cosi = clamp(dot(-d, m), 0.0, 1.0);
            let f = gi_refraction_fresnel(cosi, n1, n2);
            var next: vec3f;
            var refracted = false;
            if (gi_refraction_random(state) < f) {
                next = reflect(d, m);
            } else {
                next = refract(d, m, n1 / n2);
                refracted = dot(next, next) > 0.0;
                if (!refracted) { next = reflect(d, m); }
            }
            // A direção amostrada tem de sair do lado certo da macro-superfície (a perda do espalhamento único).
            let side = dot(next, n);
            if ((refracted && side >= 0.0) || (!refracted && side <= 0.0)) { return vec3f(0.0); }
            if (alpha >= 1e-4) { throughput *= gi_refraction_g1(side, alpha); }
            if (refracted) { medium = gi_refraction_medium(c, outside); }
            d = next;
            o = hit.position + d * (1e-3 + hit.t * 1e-5);
            continue;
        }
        let v = -d;
        // A névoa da câmera até a superfície de trás (os froxels, pelo raio da câmera até o ponto: como a cópia da cena
        // tinha), sobre a luz dela.
        let fog = scene_fog(hit.position);
        return throughput * ((scene_lighting(c, hit.position, n, v) + closure_emitted(c, n, v)) * fog.a + fog.rgb);
    }
    return vec3f(0.0);
}

/** Primeiro acerto transmissivo do pixel: a radiância por baixo da primeira interface e a distância dele. */
struct GiRefractionSample {
    radiance: vec3f,
    dist: f32,
    position: vec3f,
    valid: bool,
}

fn gi_refraction_sample(px: vec2f, state: ptr<function, u32>) -> GiRefractionSample {
    var out = GiRefractionSample(vec3f(0.0), 0.0, vec3f(0.0), false);
    let ray = gi_camera_ray(px);
    let max_dist = gi.tuning.w * 4.0;
    let hit = ray_scene_hit(ray.origin, ray.dir, max_dist);
    if (hit.t >= max_dist || hit.instance == NONE) { return out; }
    let c = gi_hit_closure(hit);
    if (c.transmission_weight <= 0.5) { return out; }
    let outside = hit.face >= 0.0;
    let n = select(-hit.normal, hit.normal, outside);
    let alpha = c.transmission_roughness * c.transmission_roughness;
    let dispersive = c.transmission_abbe > 0.0;
    var radiance = vec3f(0.0);
    for (var ch = 0u; ch < 3u; ch++) {
        let channel = select(3u, ch, dispersive);
        let ior = gi_refraction_ior(c, channel);
        let n1 = select(ior, 1.0, outside);
        let n2 = select(1.0, ior, outside);
        let m = gi_refraction_ggx(n, -ray.dir, alpha, vec2f(gi_refraction_random(state), gi_refraction_random(state)));
        let t = refract(ray.dir, m, n1 / n2);
        var l = vec3f(0.0);
        if (dot(t, t) > 0.0 && dot(t, n) < 0.0) {
            let medium = gi_refraction_medium(c, outside);
            l = gi_refraction_trace(hit.position + t * (1e-3 + hit.t * 1e-5), t, medium, channel, state);
            if (alpha >= 1e-4) { l *= gi_refraction_g1(dot(t, n), alpha); }
        }
        if (!dispersive) { radiance = l; break; }
        radiance[ch] = l[ch];
    }
    out.radiance = radiance;
    out.dist = hit.t;
    out.position = hit.position;
    out.valid = true;
    return out;
}

@compute @workgroup_size(WORKGROUP_SIZE)
fn gi_refraction_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let i = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    if (i >= gi_refraction_pixels()) { return; }
    let width = u32(gi.screenSize.x);
    let pixel = vec2u(i % width, i / width);
    var state = gi_hash(i * 9781u + gi.rays.y * 6271u);
    // Um ponto sorteado no pixel a cada quadro: a média temporal integra a área do pixel coberta pelo vidro (o
    // antisserrilhado do que se vê através dele, e o deslocamento de fração de pixel). Na silhueta, outro sorteio até
    // cair no vidro: o pixel da borda é a média da parte dele que o vidro cobre (o desenho mistura com o fundo pela
    // cobertura), nunca a de um vizinho de dentro.
    var s = gi_refraction_sample(vec2f(pixel) + vec2f(gi_refraction_random(&state), gi_refraction_random(&state)), &state);
    for (var attempt = 0u; attempt < 3u && !s.valid; attempt++) {
        s = gi_refraction_sample(vec2f(pixel) + vec2f(gi_refraction_random(&state), gi_refraction_random(&state)), &state);
    }
    let out_at = gi_refraction_at(gi.screen1.y, i);
    if (!s.valid) {
        gi_refraction_history[out_at] = vec4f(0.0);
        textureStore(gi_refraction_out, pixel, vec4f(0.0));
        return;
    }
    // A média temporal: o pixel do quadro anterior pela projeção do primeiro acerto; o histórico vale se lá havia o
    // mesmo acerto (a distância ao longo do raio a 1 %).
    var count = 1.0;
    var radiance = s.radiance;
    let vp = mat4x4f(gi_refraction_history[0], gi_refraction_history[1], gi_refraction_history[2], gi_refraction_history[3]);
    let clip = vp * vec4f(s.position, 1.0);
    if (clip.w > 0.0) {
        let ndc = clip.xy / clip.w;
        let prev = vec2f(ndc.x * 0.5 + 0.5, 0.5 - ndc.y * 0.5) * gi.screenSize.xy;
        if (all(prev >= vec2f(0.0)) && all(prev < gi.screenSize.xy)) {
            let q = vec2u(prev);
            let h = gi_refraction_history[gi_refraction_at(1u - gi.screen1.y, q.x + q.y * width)];
            let cam = cameras[gi.screen.w].position.xyz;
            let ok = h.w > 0.0 && abs(h.z - distance(cam, s.position)) <= 0.01 * h.z + 1e-3;
            if (ok) {
                count = min(h.w + 1.0, GI_REFRACTION_HISTORY);
                let old = vec3f(unpack2x16float(bitcast<u32>(h.x)), unpack2x16float(bitcast<u32>(h.y)).x);
                radiance = mix(old, s.radiance, 1.0 / count);
            }
        }
    }
    let cam = cameras[gi.screen.w].position.xyz;
    let packed = vec2f(bitcast<f32>(pack2x16float(radiance.rg)), bitcast<f32>(pack2x16float(vec2f(radiance.b, 0.0))));
    gi_refraction_history[out_at] = vec4f(packed, distance(cam, s.position), count);
    textureStore(gi_refraction_out, pixel, vec4f(radiance, 1.0));
}
