// Refração traçada (spec 034, US7; R15): por pixel, o raio da câmera ativa; se a primeira superfície é transmissiva, o
// caminho da luz que a atravessa pela estrutura de raios até uma superfície que não transmite — sem a cópia da tela.
//   - na primeira interface o raio refrata (o reflexo dela é do desenho), com a micro-normal pela GGX (VNDF) na rugosidade
//     da transmissão; reflexão interna total na entrada não traz nada por baixo (o desenho dá o reflexo);
//   - nas seguintes, Fresnel exato escolhe entre refletir e refratar (o reflexo das faces atravessadas é um raio
//     traçado), Beer–Lambert pelo trecho dentro de cada meio, até `GI_REFRACTION_INTERFACES` interfaces;
//   - na superfície que não transmite, a mesma luz que o desenho daria a ela (`scene_lighting` + emissão), com a névoa
//     da câmera até ela (`scene_fog`); sem acerto, o ambiente (`scene_environment`);
//   - com número de Abbe, um raio por canal, cada um com o IOR do seu canal e iluminado no próprio acerto;
//   - as superfícies dos volumes (a água do campo dos fluidos) são interfaces como o vidro: a normal do campo, o IOR e
//     a absorção do material pelo ponto `ray_volume_optics` — o raio entra, atravessa e sai refratando (Fresnel e
//     reflexão interna total na saída).
// Em frente de onda: `gi_refraction_main` anda até `GI_REFRACTION_FIRST` trechos de cada caminho; os que continuam (a
// reflexão interna total numa lâmina de água, um vidro com faces internas: poucos pixels, muitos trechos) vão para a
// fila, e `gi_refraction_continue_main` (despacho indireto, um fio por caminho) os leva até o fim — os fios de um grupo
// não esperam o caminho mais longo dele. Fila cheia: o caminho termina no próprio fio (o resultado é o mesmo).
// A amostra do quadro (a radiância logo abaixo da primeira interface, sem o Fresnel dela, que é do desenho, de um ponto
// sorteado no pixel) vai para o histórico (`gi_refraction_common`); a média temporal é do resolve
// (`gi_refraction_finish.wgsl`).
// Antes do traçado por pixel, `gi_refraction_tiles_main` lança 4 raios estratificados por ladrilho de 8 × 8 pixels e
// consulta o quadro anterior dele; só os pixels com um ladrilho marcado na vizinhança 3 × 3 traçam (o resto da tela não
// paga o raio da câmera nem a marcha nos volumes).
// Requer: WORKGROUP_SIZE, NONE, gi, gi_common, gi_screen_common, ray_scene, gi_hit, closure_eval, ray_volume_hit,
// ray_volume_optics, scene_lighting, scene_environment, scene_fog, gi_refraction_common, gi_refraction_history,
// gi_refraction_queue, gi_refraction_count.

/** Interfaces no máximo por caminho (um vidro com faces internas, uma pilha de placas). */
const GI_REFRACTION_INTERFACES: u32 = 24u;
/** Trechos de cada caminho no passe por pixel; o resto na continuação. */
const GI_REFRACTION_FIRST: u32 = 3u;

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

/**
 * Uma interface transmissiva no caminho: a distância, o ponto, a normal voltada para o raio, se o raio vem de fora, o
 * meio de dentro (IOR, número de Abbe, coeficiente de absorção em 1/m) e a rugosidade. Vem de uma superfície da
 * estrutura de raios com o lobo de transmissão (vidro) ou de um volume (a água, `ray_volume_hit`/`ray_volume_optics`).
 */
struct GiRefractionSurface {
    t: f32,
    position: vec3f,
    n: vec3f,
    outside: bool,
    ior: f32,
    abbe: f32,
    sigma: vec3f,
    roughness: f32,
}

/** A interface de um vidro atingido (a absorção pela cor a `depth` de percurso: σ = −ln(cor)/depth). */
fn gi_refraction_glass(hit: RayHit, c: Closure) -> GiRefractionSurface {
    let outside = hit.face >= 0.0;
    var sigma = vec3f(0.0);
    if (c.transmission_depth > 0.0) { sigma = -log(max(c.transmission_color, vec3f(1e-4))) / c.transmission_depth; }
    return GiRefractionSurface(
        hit.t, hit.position, select(-hit.normal, hit.normal, outside), outside,
        c.transmission_ior, c.transmission_abbe, sigma, c.transmission_roughness,
    );
}

/** A interface de um volume atingido (a normal do campo, para fora; a origem dentro dele: saindo). */
fn gi_refraction_volume(vol: RayVolumeHit) -> GiRefractionSurface {
    let optics = ray_volume_optics(vol.material);
    let outside = !vol.inside;
    return GiRefractionSurface(
        vol.t, vol.position, select(-vol.normal, vol.normal, outside), outside,
        optics.ior, optics.abbe, optics.absorption, 0.0,
    );
}

/** O IOR da interface no canal `ch` (0–2; 3 = sem dispersão). */
fn gi_refraction_ior(s: GiRefractionSurface, ch: u32) -> f32 {
    if (ch > 2u || s.abbe <= 0.0) { return s.ior; }
    return closure_dispersion_iors(s.ior, s.abbe)[ch];
}

/** A interface no caminho: Fresnel exato escolhe refletir ou refratar (`force`: refrata com o peso 1 − F à parte). */
struct GiRefractionStep {
    dir: vec3f,
    weight: f32,
    refracted: bool,
    valid: bool,
}

fn gi_refraction_step(s: GiRefractionSurface, d: vec3f, ch: u32, force: bool, state: ptr<function, u32>) -> GiRefractionStep {
    let ior = gi_refraction_ior(s, ch);
    let n1 = select(ior, 1.0, s.outside);
    let n2 = select(1.0, ior, s.outside);
    let alpha = s.roughness * s.roughness;
    let m = gi_refraction_ggx(s.n, -d, alpha, vec2f(gi_refraction_random(state), gi_refraction_random(state)));
    let cosi = clamp(dot(-d, m), 0.0, 1.0);
    var next = refract(d, m, n1 / n2);
    var refracted = dot(next, next) > 0.0;
    if (!force && gi_refraction_random(state) < gi_refraction_fresnel(cosi, n1, n2)) { refracted = false; }
    if (!refracted) {
        // Na primeira interface, a reflexão interna total não traz nada por baixo (o reflexo é do desenho).
        if (force) { return GiRefractionStep(d, 0.0, false, false); }
        next = reflect(d, m);
    }
    // A direção amostrada tem de sair do lado certo da macro-superfície (a perda do espalhamento único).
    let side = dot(next, s.n);
    if ((refracted && side >= 0.0) || (!refracted && side <= 0.0)) { return GiRefractionStep(d, 0.0, false, false); }
    var weight = 1.0;
    if (alpha >= 1e-4) { weight = gi_refraction_g1(side, alpha); }
    return GiRefractionStep(next, weight, refracted, true);
}

/**
 * Um caminho em curso: a origem e a direção do próximo trecho, a fração da luz que ainda chega ao pixel, o meio em que
 * anda (absorção em 1/m), o canal (0–2; 3 = todos), o estado do sorteio, os trechos andados e o pixel.
 */
struct GiRefractionPath {
    o: vec3f,
    d: vec3f,
    throughput: vec3f,
    sigma: vec3f,
    ch: u32,
    state: u32,
    segments: u32,
    pixel: u32,
}

/**
 * Anda até `budget` trechos do caminho: em cada um, o vidro da estrutura de raios ou a superfície de um volume, o que
 * vier antes. Devolve a radiância que chega ao pixel (rgb, já pela fração do caminho) e w = 1 se o caminho terminou
 * (numa superfície que não transmite, no ambiente, perdido ou no limite de interfaces), 0 se continua.
 */
fn gi_refraction_walk(path: ptr<function, GiRefractionPath>, budget: u32) -> vec4f {
    let max_dist = gi.tuning.w * 4.0;
    for (var k = 0u; k < budget; k++) {
        if ((*path).segments >= GI_REFRACTION_INTERFACES) { return vec4f(0.0, 0.0, 0.0, 1.0); }
        (*path).segments += 1u;
        let o = (*path).o;
        let d = (*path).d;
        let hit = ray_scene_hit(o, d, max_dist);
        let span = min(hit.t, max_dist);
        let vol = ray_volume_hit(o, d, span);
        (*path).throughput *= exp(-(*path).sigma * select(span, vol.t, vol.hit));
        var surface: GiRefractionSurface;
        if (vol.hit) {
            surface = gi_refraction_volume(vol);
        } else {
            if (hit.t >= max_dist || hit.instance == NONE) {
                return vec4f((*path).throughput * scene_environment(d), 1.0);
            }
            let c = gi_hit_closure(hit);
            if (c.transmission_weight <= 0.5) {
                let outside = hit.face >= 0.0;
                let n = select(-hit.normal, hit.normal, outside);
                let v = -d;
                // A névoa da câmera até a superfície de trás (os froxels, pelo raio da câmera até o ponto: como a cópia
                // da cena tinha), sobre a luz dela.
                let fog = scene_fog(hit.position);
                let light = (scene_lighting(c, hit.position, n, v) + closure_emitted(c, n, v)) * fog.a + fog.rgb;
                return vec4f((*path).throughput * light, 1.0);
            }
            surface = gi_refraction_glass(hit, c);
        }
        var state = (*path).state;
        let step = gi_refraction_step(surface, d, (*path).ch, false, &state);
        (*path).state = state;
        if (!step.valid) { return vec4f(0.0, 0.0, 0.0, 1.0); }
        (*path).throughput *= step.weight;
        if (step.refracted) { (*path).sigma = select(vec3f(0.0), surface.sigma, surface.outside); }
        (*path).d = step.dir;
        (*path).o = surface.position + step.dir * (1e-3 + surface.t * 1e-5);
    }
    return vec4f(0.0);
}

/** Põe o caminho na fila de continuação; cheia, devolve falso. */
fn gi_refraction_enqueue(path: GiRefractionPath) -> bool {
    let slot = atomicAdd(&gi_refraction_count[3], 1u);
    if (slot >= arrayLength(&gi_refraction_queue) / 4u) { return false; }
    let q = slot * 4u;
    gi_refraction_queue[q] = vec4f(path.o, bitcast<f32>(path.pixel));
    gi_refraction_queue[q + 1u] = vec4f(path.d, bitcast<f32>(path.ch));
    gi_refraction_queue[q + 2u] = vec4f(path.throughput, bitcast<f32>(path.state));
    gi_refraction_queue[q + 3u] = vec4f(path.sigma, bitcast<f32>(path.segments));
    return true;
}

/** Primeiro acerto transmissivo do pixel: a radiância por baixo da primeira interface e a distância dele. */
struct GiRefractionSample {
    radiance: vec3f,
    dist: f32,
    position: vec3f,
    valid: bool,
}

/** A primeira superfície do raio da câmera pelo ponto `px` do alvo, se transmissiva (o vidro ou um volume). */
struct GiRefractionFirst {
    surface: GiRefractionSurface,
    valid: bool,
}

fn gi_refraction_first(ray: GiCameraRay) -> GiRefractionFirst {
    var out: GiRefractionFirst;
    out.valid = false;
    let max_dist = gi.tuning.w * 4.0;
    let hit = ray_scene_hit(ray.origin, ray.dir, max_dist);
    let vol = ray_volume_hit(ray.origin, ray.dir, min(hit.t, max_dist));
    if (vol.hit) {
        out.surface = gi_refraction_volume(vol);
        out.valid = true;
        return out;
    }
    if (hit.t >= max_dist || hit.instance == NONE) { return out; }
    let c = gi_hit_closure(hit);
    if (c.transmission_weight <= 0.5) { return out; }
    out.surface = gi_refraction_glass(hit, c);
    out.valid = true;
    return out;
}

/**
 * A amostra do pixel `pixel` pelo ponto `px` dele: cada caminho (um por canal com dispersão) anda os primeiros trechos;
 * o que continua vai para a fila (a radiância dele chega pela continuação) ou, com ela cheia, termina aqui.
 */
fn gi_refraction_sample(px: vec2f, pixel: u32, state: ptr<function, u32>) -> GiRefractionSample {
    var out = GiRefractionSample(vec3f(0.0), 0.0, vec3f(0.0), false);
    let ray = gi_camera_ray(px);
    let first = gi_refraction_first(ray);
    if (!first.valid) { return out; }
    let surface = first.surface;
    let dispersive = surface.abbe > 0.0;
    var radiance = vec3f(0.0);
    for (var ch = 0u; ch < 3u; ch++) {
        let channel = select(3u, ch, dispersive);
        let step = gi_refraction_step(surface, ray.dir, channel, true, state);
        var l = vec3f(0.0);
        if (step.valid) {
            var path = GiRefractionPath(
                surface.position + step.dir * (1e-3 + surface.t * 1e-5), step.dir, vec3f(step.weight),
                select(vec3f(0.0), surface.sigma, surface.outside), channel, gi_hash(*state + ch * 7919u), 0u, pixel,
            );
            // Uma chamada só do trecho (o WGSL copia as funções em cada chamada: duas dobrariam o kernel).
            var budget = GI_REFRACTION_FIRST;
            var r = vec4f(0.0);
            loop {
                r = gi_refraction_walk(&path, budget);
                if (r.w > 0.0 || gi_refraction_enqueue(path)) { break; }
                budget = GI_REFRACTION_INTERFACES;
            }
            l = r.rgb;
        }
        if (!dispersive) { radiance = l; break; }
        radiance[ch] = l[ch];
    }
    out.radiance = radiance;
    out.dist = surface.t;
    out.position = surface.position;
    out.valid = true;
    return out;
}

/**
 * A marca de cada ladrilho: algum dos 4 raios estratificados (um ponto sorteado em cada quadrante de 4 × 4 pixels) tem
 * primeiro acerto transmissivo, ou algum pixel dele tinha refração no quadro anterior (o que encolhe ou some de um
 * quadro para o outro). O que é menor que um quadrante e escapa dos raios entra pelo sorteio dos quadros seguintes.
 */
@compute @workgroup_size(WORKGROUP_SIZE)
fn gi_refraction_tiles_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let i = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    let tiles = gi_refraction_tiles();
    if (i >= tiles.x * tiles.y) { return; }
    let t = vec2u(i % tiles.x, i / tiles.x);
    let size = vec2u(gi.screenSize.xy);
    let base = t * GI_REFRACTION_TILE;
    var marked = false;
    // O quadro anterior do ladrilho.
    let width = size.x;
    let last = 1u - gi.screen1.y;
    for (var y = 0u; y < GI_REFRACTION_TILE && !marked; y++) {
        for (var x = 0u; x < GI_REFRACTION_TILE; x++) {
            let p = base + vec2u(x, y);
            if (any(p >= size)) { continue; }
            if (gi_refraction_history[gi_refraction_at(last, p.x + p.y * width)].w > 0.0) {
                marked = true;
                break;
            }
        }
    }
    var state = gi_hash(i * 7919u + gi.rays.y * 104729u + 17u);
    let half = GI_REFRACTION_TILE / 2u;
    for (var q = 0u; q < 4u && !marked; q++) {
        let corner = base + vec2u(q & 1u, q >> 1u) * half;
        let px = vec2f(corner) + vec2f(gi_refraction_random(&state), gi_refraction_random(&state)) * f32(half);
        if (any(px >= gi.screenSize.xy)) { continue; }
        marked = gi_refraction_first(gi_camera_ray(px)).valid;
    }
    gi_refraction_history[gi_refraction_tile_at(t)] = vec4f(select(0.0, 1.0, marked), 0.0, 0.0, 0.0);
}

/** Algum ladrilho marcado na vizinhança 3 × 3 do ladrilho do pixel (o que se moveu até 8 pixels no quadro). */
fn gi_refraction_near(pixel: vec2u) -> bool {
    let tiles = gi_refraction_tiles();
    let t = vec2i(pixel / GI_REFRACTION_TILE);
    for (var dy = -1; dy <= 1; dy++) {
        for (var dx = -1; dx <= 1; dx++) {
            let n = t + vec2i(dx, dy);
            if (any(n < vec2i(0)) || any(n >= vec2i(tiles))) { continue; }
            if (gi_refraction_history[gi_refraction_tile_at(vec2u(n))].x > 0.0) { return true; }
        }
    }
    return false;
}

@compute @workgroup_size(WORKGROUP_SIZE)
fn gi_refraction_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let i = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    if (i >= gi_refraction_pixels()) { return; }
    let width = u32(gi.screenSize.x);
    let pixel = vec2u(i % width, i / width);
    if (!gi_refraction_near(pixel)) {
        gi_refraction_history[gi_refraction_sample_at(i, 0u)] = vec4f(0.0);
        return;
    }
    var state = gi_hash(i * 9781u + gi.rays.y * 6271u);
    // Um ponto sorteado no pixel a cada quadro: a média temporal integra a área do pixel coberta pelo vidro (o
    // antisserrilhado do que se vê através dele, e o deslocamento de fração de pixel). Na silhueta, outro sorteio até
    // cair no vidro: o pixel da borda é a média da parte dele que o vidro cobre (o desenho mistura com o fundo pela
    // cobertura), nunca a de um vizinho de dentro.
    // Uma chamada só da amostra, pela mesma razão.
    var s: GiRefractionSample;
    for (var attempt = 0u; attempt < 4u; attempt++) {
        s = gi_refraction_sample(vec2f(pixel) + vec2f(gi_refraction_random(&state), gi_refraction_random(&state)), i, &state);
        if (s.valid) { break; }
    }
    gi_refraction_history[gi_refraction_sample_at(i, 0u)] = vec4f(s.radiance, select(0.0, 1.0, s.valid));
    gi_refraction_history[gi_refraction_sample_at(i, 1u)] = vec4f(s.position, s.dist);
}

/** Os caminhos da fila até o fim: a radiância de cada um somada no canal dele da amostra do pixel. */
@compute @workgroup_size(WORKGROUP_SIZE)
fn gi_refraction_continue_main(@builtin(global_invocation_id) gid3: vec3u) {
    let k = gid3.x;
    if (k >= bitcast<u32>(gi_refraction_history[gi_refraction_queued_at()].x)) { return; }
    let q0 = gi_refraction_queue[k * 4u];
    let q1 = gi_refraction_queue[k * 4u + 1u];
    let q2 = gi_refraction_queue[k * 4u + 2u];
    let q3 = gi_refraction_queue[k * 4u + 3u];
    var path = GiRefractionPath(
        q0.xyz, q1.xyz, q2.xyz, q3.xyz, bitcast<u32>(q1.w), bitcast<u32>(q2.w), bitcast<u32>(q3.w), bitcast<u32>(q0.w),
    );
    let r = gi_refraction_walk(&path, GI_REFRACTION_INTERFACES);
    let at = gi_refraction_sample_at(path.pixel, 0u);
    if (path.ch > 2u) {
        gi_refraction_history[at] = gi_refraction_history[at] + vec4f(r.rgb, 0.0);
    } else {
        // Com dispersão, cada canal tem o seu caminho (e o seu fio): só o componente dele.
        gi_refraction_history[at][path.ch] = gi_refraction_history[at][path.ch] + r[path.ch];
    }
}
