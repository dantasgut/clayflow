// Refração pela estrutura de raios (spec 034, R1–R4), a geometria do caminho: da entrada de um pedido, o raio refratado
// segue pela cena — entra no objeto, acha a face de saída (a própria geometria está na estrutura), refrata ou reflete
// totalmente, encadeia os vidros e a água seguintes — até a primeira superfície que não transmite. Absorção Beer-Lambert
// pela distância percorrida em cada meio; parede fina sem desvio. A água (os volumes de `ray_volume_enter`/`ray_volume_exit`) é uma
// interface como as superfícies: o meio dela (IOR, Abbe, absorção) vem de `ray_volume_medium` e entra na pilha dos meios
// como o do vidro — o cruzamento já diz onde a água começa e termina, sem marchar de novo pela transmitância.
// O caminho devolve o que não depende das luzes da cena — o fundo de quem escapa (`scene_background`), o reflexo do
// ambiente nas faces dos vidros e da água atravessados (`scene_environment`), com dispersão a emissão por canal e, no limite
// de interfaces, a cópia da cena lida lisa (bicúbica) onde a próxima superfície aparece — e a superfície vista com o
// quanto chega dela (`throughput`). A luz dela (`scene_lighting`) vem no segundo kernel (`refraction_shade.wgsl`): as
// luzes, as sombras e a luz rebatida pedem mais buffers do que um kernel comporta junto com a estrutura e os volumes.
// Requer: closure, closure_eval, ray_hit, ray_scene, ray_volume_enter, ray_volume_exit, ray_volume_medium,
// scene_background, scene_environment, refraction (parâmetros), refraction_frame, refraction_copy.

const REFRACTION_EPS: f32 = 1e-4;
const REFRACTION_FAR: f32 = 1e4;
/**
 * Cruzamentos com a água mais perto que isto (m) são a própria superfície de onde o raio saiu: a superfície do campo é
 * achada por marcha, com precisão bem pior que a das malhas — sem a folga, o raio entrava e saía da mesma superfície até
 * esgotar as interfaces.
 */
const REFRACTION_VOLUME_EPS: f32 = 5e-3;
/** Meios aninhados acompanhados pelo raio (vidro dentro de vidro, água no copo). */
const REFRACTION_STACK: u32 = 4u;

/** Um meio atravessado: IOR do canal, cor e distância da absorção (Beer-Lambert); `depth` < 0: `color` é o coeficiente. */
struct RefractionMedium {
    ior: f32,
    color: vec3f,
    depth: f32,
}

/** O caminho de um raio refratado: o que já chegou, a superfície vista e o quanto chega dela. */
struct RefractionPath {
    /** Radiância que não depende das luzes (fundo, emissão, reflexos do ambiente, a cópia no limite). */
    radiance: vec3f,
    /** Fração da luz da superfície vista que chega à entrada (0 sem superfície a iluminar). */
    throughput: vec3f,
    /** Distância da entrada à primeira superfície atingida (o desfoque da rugosidade). */
    first: f32,
    /** Há superfície a iluminar. */
    lit: bool,
    hit: RayHit,
    /** Direção do raio que chegou à superfície. */
    dir: vec3f,
}

fn refraction_absorb(m: RefractionMedium, dist: f32) -> vec3f {
    // Coeficiente por metro (a água: `ray_volume_medium`).
    if (m.depth < 0.0) { return exp(-m.color * max(dist, 0.0)); }
    if (m.depth == 0.0) { return vec3f(1.0); }
    return pow(max(m.color, vec3f(1e-4)), vec3f(max(dist, 0.0) / m.depth));
}

/** Fresnel exato não polarizado de `n1` para `n2` com o cosseno de incidência `cosi` (1 = reflexão total). */
fn refraction_fresnel(n1: f32, n2: f32, cosi: f32) -> f32 {
    let eta = n1 / n2;
    let sin2t = eta * eta * (1.0 - cosi * cosi);
    if (sin2t >= 1.0) { return 1.0; }
    let cost = sqrt(1.0 - sin2t);
    let rs = (n1 * cosi - n2 * cost) / (n1 * cosi + n2 * cost);
    let rp = (n1 * cost - n2 * cosi) / (n1 * cost + n2 * cosi);
    return 0.5 * (rs * rs + rp * rp);
}

/** IOR do canal `k` pelo número de Abbe (o mesmo de `closure_dispersion_iors`). */
fn refraction_channel_ior(ior: f32, abbe: f32, k: u32) -> f32 {
    return closure_dispersion_iors(ior, abbe)[min(k, 2u)];
}

/** Reflexo do ambiente numa face atravessada (Fresnel `f`, normal `n` voltada para o raio). */
fn refraction_face_reflection(dir: vec3f, n: vec3f, f: f32) -> vec3f {
    return f * scene_environment(reflect(dir, n));
}

/** O caminho do raio refratado na entrada `p` (normal `n`, observador `v`) no canal `k`. */
fn refraction_trace_ray(
    cam: CameraMatrices,
    p: vec3f,
    n: vec3f,
    v: vec3f,
    entry: RefractionMedium,
    thin: bool,
    volume: bool,
    k: u32,
    time: f32,
    dispersive: bool,
) -> RefractionPath {
    var stack: array<RefractionMedium, REFRACTION_STACK>;
    var depth = 0u;
    var dir = -v;
    var origin = p;
    if (thin) {
        // Parede fina: atravessa sem desvio nem meio.
        origin = p + dir * REFRACTION_EPS;
    } else {
        let r = refract(-v, n, 1.0 / entry.ior);
        dir = select(-v, normalize(r), dot(r, r) > 0.0);
        // Entrada num volume (a superfície da água, achada por marcha): começa já dentro dele, além da folga.
        origin = select(p - n * REFRACTION_EPS, p + dir * REFRACTION_VOLUME_EPS, volume);
        stack[0] = entry;
        depth = 1u;
    }
    var path: RefractionPath;
    path.radiance = vec3f(0.0);
    path.throughput = vec3f(0.0);
    path.first = -1.0;
    path.lit = false;
    var throughput = vec3f(1.0);
    let interfaces = max(refraction.maxInterfaces, 1u);
    for (var i = 0u; i <= interfaces; i++) {
        let hit = ray_scene_hit(origin, dir, REFRACTION_FAR);
        // O lado dos volumes pela pilha: dentro da água, a saída; fora, a entrada.
        let in_volume = depth > 0u && stack[max(depth, 1u) - 1u].depth < 0.0;
        var vol: RayVolumeHit;
        if (in_volume) {
            vol = ray_volume_exit(origin, dir, min(hit.t, REFRACTION_FAR));
        } else {
            vol = ray_volume_enter(origin, dir, min(hit.t, REFRACTION_FAR));
        }
        let water = vol.hit && vol.t < hit.t && vol.t > REFRACTION_VOLUME_EPS;
        let seg = select(min(hit.t, REFRACTION_FAR), vol.t, water);
        if (depth > 0u) { throughput = throughput * refraction_absorb(stack[depth - 1u], seg); }
        if (water) {
            // Superfície da água: entra (de fora) ou sai (de dentro); a absorção dentro dela vem do volume.
            if (path.first < 0.0) { path.first = distance(p, vol.position); }
            let wn = select(-vol.normal, vol.normal, dot(vol.normal, dir) < 0.0);
            let medium = ray_volume_medium(vol.material);
            let wior = refraction_channel_ior(medium.ior, medium.abbe, k);
            let wcos = clamp(-dot(wn, dir), 0.0, 1.0);
            let wn1 = select(1.0, stack[max(depth, 1u) - 1u].ior, depth > 0u);
            var wn2 = wior;
            if (vol.inside) { wn2 = select(1.0, stack[max(depth, 2u) - 2u].ior, depth > 1u); }
            let wf = refraction_fresnel(wn1, wn2, wcos);
            if (!vol.inside) { path.radiance += throughput * refraction_face_reflection(dir, wn, wf); }
            if (wf >= 1.0) {
                dir = reflect(dir, wn);
                origin = vol.position + wn * REFRACTION_EPS;
                continue;
            }
            throughput = throughput * (1.0 - wf);
            dir = normalize(refract(dir, wn, wn1 / wn2));
            origin = vol.position - wn * REFRACTION_EPS;
            if (!vol.inside) {
                if (depth < REFRACTION_STACK) {
                    stack[depth] = RefractionMedium(wior, medium.absorption, -1.0);
                    depth = depth + 1u;
                }
            } else if (depth > 0u) {
                depth = depth - 1u;
            }
            continue;
        }
        if (hit.t >= REFRACTION_FAR) {
            // Escapou: o céu na direção ou, sem céu, a cor de limpeza (o mesmo fundo da vista direta).
            let clear = refraction_frame.clear;
            path.radiance += throughput * select(scene_background(dir), clear.rgb, clear.w > 0.5);
            break;
        }
        let hp = hit.position;
        // A normal voltada para a origem do raio.
        let nf = select(-hit.normal, hit.normal, dot(hit.normal, dir) < 0.0);
        if (path.first < 0.0) { path.first = distance(p, hp); }
        if (i == interfaces) {
            // Limite: a cópia da cena lida lisa onde a próxima superfície aparece na tela.
            let uv = refraction_screen_uv(cam, hp);
            if (all(uv >= vec2f(0.0)) && all(uv <= vec2f(1.0))) {
                path.radiance += throughput * refraction_bicubic(uv);
            }
            break;
        }
        let c = ray_hit_closure(hit, time);
        let transmits = c.transmission_weight > 0.0 || c.translucent_weight > 0.0;
        if (!transmits) {
            // A superfície vista: a luz (ou a cópia, onde ela basta) e a emissão no segundo kernel; com dispersão, a
            // emissão aqui, por canal.
            if (dispersive) { path.radiance += throughput * closure_emitted(c, nf, -dir); }
            path.throughput = throughput;
            path.lit = true;
            path.hit = hit;
            path.hit.normal = nf;
            path.dir = dir;
            break;
        }
        let cosi = clamp(-dot(nf, dir), 0.0, 1.0);
        let entering = hit.face > 0.0;
        if (c.transmission_weight <= 0.0) {
            // Parede fina atingida: o reflexo do ambiente e a luz que passa sem desvio.
            let under = closure_under_dielectric(c, max(cosi, 1e-4));
            path.radiance += throughput * (vec3f(1.0) - under) * scene_environment(reflect(dir, nf));
            throughput = throughput * c.translucent_weight * c.translucent_color * under;
            origin = hp + dir * REFRACTION_EPS;
            continue;
        }
        let n1 = select(1.0, stack[max(depth, 1u) - 1u].ior, depth > 0u);
        var n2 = 1.0;
        let hit_ior = refraction_channel_ior(c.transmission_ior, c.transmission_abbe, k);
        if (entering) {
            n2 = hit_ior;
        } else if (depth > 1u) {
            n2 = stack[depth - 2u].ior;
        }
        let f = refraction_fresnel(n1, n2, cosi);
        if (entering) { path.radiance += throughput * refraction_face_reflection(dir, nf, f); }
        if (f >= 1.0) {
            // Reflexão interna total: segue refletido no mesmo meio.
            dir = reflect(dir, nf);
            origin = hp + nf * REFRACTION_EPS;
            continue;
        }
        throughput = throughput * (1.0 - f) * c.transmission_weight;
        dir = normalize(refract(dir, nf, n1 / n2));
        origin = hp - nf * REFRACTION_EPS;
        if (entering) {
            if (depth < REFRACTION_STACK) {
                stack[depth] = RefractionMedium(hit_ior, c.transmission_color, c.transmission_depth);
                depth = depth + 1u;
            }
        } else if (depth > 0u) {
            depth = depth - 1u;
        }
    }
    path.first = max(path.first, 0.0);
    return path;
}
