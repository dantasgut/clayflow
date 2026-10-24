// O caminho traçado da refração (spec 034, R1, T044), uma amostra do raio de um pixel (`refraction_sample`): o raio
// da câmera, a partir do plano próximo como o raster, parte da pilha de meios da câmera (`refraction_frame`). Na
// primeira interface os dois lobos são traçados — a reflexão e a transmissão, cada uma com o Fresnel por canal; com
// dispersão, a transmissão é um caminho por canal, com o índice do canal em toda interface seguinte. Nas interfaces
// seguintes um lobo, pela roleta de Fresnel (sem viés: o acúmulo converge). Cada trecho é absorvido no meio corrente
// (Beer–Lambert). No acerto opaco: a emissão, a luz direta com raio de sombra (`ray_direct`) e a luz rebatida da cena
// (`scene_indirect_lighting`: as sondas da GI, ou o hemisfério); no escape, o ambiente (`scene_environment`). Depois de
// `max_interfaces` interfaces (ou de um meio além do teto da pilha) a energia restante conta como absorvida (a
// luminância dela sai à parte). O fechamento com transmissão parcial é dielétrico com a probabilidade do peso dela,
// opaco no resto. A parede fina (`closure_thin_walled`) não muda a pilha: reflete com 2R/(1 + R) ou atravessa sem
// desviar. Sai também o ponto em que termina o caminho que mais contribui para a cor, com o registro do objeto.
// Determinística: o mesmo raio, o mesmo estado aleatório e a mesma cena dão a mesma amostra (o gradiente temporal
// refaz a do quadro anterior).
// Requer: NONE, refraction, refraction_interface, refraction_media, ray_scene, ray_hit, camera_space, ray_direct,
// closure_eval, scene_environment, scene_indirect_lighting, refraction_frame.

/** Distância máxima dos raios. */
const REFRACTION_FAR: f32 = 1.0e6;

/**
 * Origem do raio que sai da interface no ponto `p` (face `nf`) na direção `dir`: andando sobre a própria linha do raio
 * até ficar a 2e-4·(tamanho das coordenadas) da superfície — a precisão do ponto cai com elas. Afastar pela normal
 * desloca a linha de lado, e numa lupa (ampliação forte perto das dobras da cáustica) uma fração de milímetro no ponto
 * de saída cria ou apaga traços inteiros da imagem.
 */
fn refraction_departure(p: vec3f, nf: vec3f, dir: vec3f) -> vec3f {
    let gap = 2e-4 * max(1.0, max(abs(p.x), max(abs(p.y), abs(p.z))));
    return p + dir * (gap / max(abs(dot(dir, nf)), 0.05));
}

/** Estado aleatório da amostra do pixel `pixel` (índice linear) no quadro `frame`. */
fn refraction_seed(pixel: u32, frame: u32) -> u32 {
    return random_seed(RANDOM_STREAM_REFRACTION, pixel, frame);
}

/** Número uniforme em [0, 1) do estado do caminho. */
fn refraction_random(state: ptr<function, u32>) -> f32 {
    return random_unit(random_next(state));
}

/** A pilha de meios da câmera no quadro. */
fn refraction_camera_stack() -> RefractionStack {
    var s = refraction_empty_stack();
    for (var k = 0u; k < REFRACTION_MAX_MEDIA; k++) {
        let a = textureLoad(refraction_frame, vec2u(2u * k, 0u), 0);
        let b = textureLoad(refraction_frame, vec2u(2u * k + 1u, 0u), 0);
        if (a.x == NONE) { continue; }
        s.media[s.count] = RefractionMedium(a.x, bitcast<f32>(a.y), bitcast<vec3f>(vec3u(a.zw, b.x)),
            bitcast<vec3f>(b.yzw));
        s.count += 1u;
    }
    return s;
}

/** O fechamento é uma interface dielétrica (com a probabilidade do peso da transmissão)? */
fn refraction_takes_interface(c: Closure, state: ptr<function, u32>) -> bool {
    if (c.transmission_weight <= 0.0) { return false; }
    return c.transmission_weight >= 1.0 || refraction_random(state) < c.transmission_weight;
}

/** Luz que sai de um ponto opaco atingido para quem vê de `v`. */
fn refraction_shade(c: Closure, hit: RayHit, v: vec3f, seed: u32) -> vec3f {
    let n = select(hit.normal, -hit.normal, dot(hit.normal, v) < 0.0);
    return closure_emitted(c, n, v) + ray_direct(c, hit.position, n, v, refraction.light_count, seed)
        + scene_indirect_lighting(c, hit.position, n, v);
}

/**
 * Refletância da parede fina (`closure_thin_walled`) por canal: a placa de espessura zero no meio `outside`, com as
 * reflexões múltiplas entre as duas faces somadas, R + T²R/(1 − R²) = 2R/(1 + R), R o Fresnel da face (a referência).
 */
fn refraction_thin_reflectance(c: Closure, outside: RefractionMedium, cos_i: f32) -> vec3f {
    let slab = closure_dispersion_iors(c.transmission_ior, c.transmission_abbe);
    var out: vec3f;
    for (var k = 0; k < 3; k++) {
        let r = refraction_fresnel(cos_i, outside.ior[k], slab[k]);
        out[k] = 2.0 * r / (1.0 + r);
    }
    return out;
}

/** Direção espelhada de `d` na face `nf`. */
fn refraction_mirror(d: vec3f, nf: vec3f) -> vec3f {
    return d - nf * (2.0 * dot(d, nf));
}

/** O que a interface atingida faz com a pilha: os meios antes e depois, a face voltada para o raio e a rugosidade. */
struct RefractionCrossing {
    p: vec3f,
    nf: vec3f,
    after: RefractionStack,
    before: RefractionMedium,
    next: RefractionMedium,
    /** A borda é interface (`crosses`: muda o meio corrente)? */
    crosses: bool,
    alpha: f32,
}

/** Cruza a borda da instância do acerto. */
fn refraction_cross_one(s: RefractionStack, hit: RayHit, c: Closure) -> RefractionStack {
    if (hit.face < 0.0) { return refraction_leave(s, hit.instance); }
    return refraction_enter(s, refraction_medium(c, hit.instance));
}

/**
 * A interface no acerto `hit` (fechamento `c`) do raio (o, d) — e a dielétrica coincidente, se houver (outra instância a
 * menos de 1e-5·(1 + t)), cruzadas juntas, como a referência.
 */
fn refraction_crossing(o: vec3f, d: vec3f, hit: RayHit, c: Closure, s: RefractionStack) -> RefractionCrossing {
    var out: RefractionCrossing;
    out.p = hit.position;
    out.nf = select(hit.normal, -hit.normal, dot(hit.normal, d) > 0.0);
    out.after = refraction_cross_one(s, hit, c);
    var rough = c.transmission_roughness;
    let tol = 1e-5 * (1.0 + hit.t);
    let other = ray_scene_hit_excluding(o, d, hit.t + tol, hit.instance);
    if (other.instance != NONE && other.t >= hit.t - tol) {
        let c2 = ray_hit_closure(other, refraction.time, 0.0);
        if (c2.transmission_weight > 0.0) {
            out.after = refraction_cross_one(out.after, other, c2);
            rough = max(rough, c2.transmission_roughness);
        }
    }
    out.before = refraction_current(s);
    out.next = refraction_current(out.after);
    out.crosses = out.before.instance != out.next.instance;
    out.alpha = rough * rough;
    return out;
}

/**
 * Resultado de um caminho: a radiância, a energia que restava no limite de interfaces (por canal) e onde ele termina —
 * o ponto de mundo e, em bits, o registro `Renderable` do objeto (`NONE`: o céu, ou sem registro).
 */
struct RefractionPath {
    radiance: vec3f,
    truncated: vec3f,
    end: vec4f,
}

/** Fim de um caminho no ponto `p` do registro `record`. */
fn refraction_end(p: vec3f, record: u32) -> vec4f {
    return vec4f(p, bitcast<f32>(record));
}

/**
 * Caminho a partir de (o0, d0) com a pilha `stack0` no canal `channel0` (−1 = os três), depois de `interfaces0`
 * interfaces: a roleta de Fresnel em cada interface até um opaco, o escape ou o limite.
 */
fn refraction_path(o0: vec3f, d0: vec3f, stack0: RefractionStack, channel0: i32, interfaces0: u32,
    state: ptr<function, u32>) -> RefractionPath {
    var out = RefractionPath(vec3f(0.0), vec3f(0.0), refraction_end(o0, NONE));
    var o = o0;
    var d = d0;
    var stack = stack0;
    var channel = channel0;
    var interfaces = interfaces0;
    var throughput = vec3f(1.0);
    loop {
        let hit = ray_scene_hit(o, d, REFRACTION_FAR);
        throughput = refraction_absorb(throughput, refraction_current(stack), min(hit.t, REFRACTION_FAR));
        if (hit.instance == NONE) {
            out.radiance += throughput * scene_environment(d);
            out.end = refraction_end(o + d * REFRACTION_FAR, NONE);
            break;
        }
        let c = ray_hit_closure(hit, refraction.time, 0.0);
        if (!refraction_takes_interface(c, state)) {
            out.radiance += throughput * refraction_shade(c, hit, -d, *state);
            out.end = refraction_end(hit.position, hit.renderable);
            break;
        }
        interfaces += 1u;
        if (interfaces > refraction.max_interfaces || stack.overflow != 0u) {
            out.truncated = throughput;
            out.end = refraction_end(hit.position, hit.renderable);
            break;
        }
        if (c.transmission_thin > 0.0) {
            // Parede fina: a pilha não muda; reflete pela roleta da refletância (do canal seguido, ou do verde com o
            // peso por canal) ou atravessa sem desviar.
            let nf = select(hit.normal, -hit.normal, dot(hit.normal, d) > 0.0);
            let f = refraction_thin_reflectance(c, refraction_current(stack), abs(dot(d, hit.normal)));
            let p = clamp(select(f.y, f[max(channel, 0)], channel >= 0), 1e-4, 1.0 - 1e-4);
            if (refraction_random(state) < p) {
                throughput *= f / p;
                d = refraction_mirror(d, nf);
            } else {
                throughput *= (vec3f(1.0) - f) / (1.0 - p);
            }
            o = refraction_departure(hit.position, nf, d);
            continue;
        }
        let x = refraction_crossing(o, d, hit, c, stack);
        if (!x.crosses) {
            stack = x.after;
            o = refraction_departure(x.p, x.nf, d);
            continue;
        }
        if (channel < 0 && (refraction_dispersive(x.before) || refraction_dispersive(x.next))) {
            // A dispersão separa os canais: um sorteado segue, com o triplo do peso.
            channel = min(2, i32(refraction_random(state) * 3.0));
            var only = vec3f(0.0);
            only[channel] = 3.0 * throughput[channel];
            throughput = only;
        }
        let n1 = refraction_ior(x.before, channel);
        let n2 = refraction_ior(x.next, channel);
        let u = vec2f(refraction_random(state), refraction_random(state));
        let m = refraction_microfacet(d, x.nf, x.alpha, u);
        let f = refraction_fresnel(dot(-d, m), n1, n2);
        var lobe: RefractionLobe;
        if (refraction_random(state) < f) {
            lobe = refraction_reflect(d, m, x.nf, x.alpha);
        } else {
            lobe = refraction_transmit(d, m, x.nf, n1, n2, x.alpha);
            stack = x.after;
        }
        if (lobe.weight <= 0.0) {
            out.end = refraction_end(x.p, hit.renderable);
            break;
        }
        throughput *= lobe.weight;
        d = lobe.dir;
        o = refraction_departure(x.p, x.nf, d);
    }
    return out;
}

/**
 * Uma amostra do pixel: a radiância (a transmitida mais a refletida na primeira interface), a luminância da energia
 * truncada e o fim do caminho que mais contribui (e o peso dele).
 */
struct RefractionSample {
    radiance: vec3f,
    truncated: f32,
    end: vec4f,
    end_weight: f32,
}

/** Uma amostra do raio da câmera `ray` (a roleta, a microfaceta e as luzes pelo estado `state`). */
fn refraction_sample(ray: RayCamera, stack: RefractionStack, state: ptr<function, u32>) -> RefractionSample {
    var radiance = vec3f(0.0);
    var reflection = vec3f(0.0);
    var truncated = 0.0;
    // O fim do caminho que mais contribui para a cor (a maior luminância).
    var end = refraction_end(ray.origin + ray.dir * REFRACTION_FAR, NONE);
    var end_weight = -1.0;
    // O raio parte do plano próximo, como o raster (o que fica antes dele não é visto); o meio da câmera absorve desde
    // ela.
    let start = ray.origin + ray.dir * ray.near;
    let hit = ray_scene_hit(start, ray.dir, REFRACTION_FAR);
    let through = refraction_absorb(vec3f(1.0), refraction_current(stack), min(hit.t + ray.near, REFRACTION_FAR));
    if (hit.instance == NONE) {
        radiance = through * scene_environment(ray.dir);
    } else {
        let c = ray_hit_closure(hit, refraction.time, 0.0);
        if (!refraction_takes_interface(c, state)) {
            // Borda em que o raio e o raster discordam, ou a parte opaca de um transmissivo parcial.
            radiance = through * refraction_shade(c, hit, -ray.dir, *state);
            end = refraction_end(hit.position, hit.renderable);
            end_weight = luminance(radiance);
        } else if (c.transmission_thin > 0.0) {
            // Parede fina na primeira interface: o reflexo e a passagem direta traçados, a pilha da câmera nos dois.
            let d = ray.dir;
            let nf = select(hit.normal, -hit.normal, dot(hit.normal, d) > 0.0);
            let f = refraction_thin_reflectance(c, refraction_current(stack), abs(dot(d, hit.normal)));
            let rd = refraction_mirror(d, nf);
            let pr = refraction_path(refraction_departure(hit.position, nf, rd), rd, stack, -1, 1u, state);
            reflection = through * f * pr.radiance;
            let pt = refraction_path(refraction_departure(hit.position, nf, d), d, stack, -1, 1u, state);
            radiance = through * (vec3f(1.0) - f) * pt.radiance;
            let reflected = luminance(reflection) > luminance(radiance);
            end = select(pt.end, pr.end, reflected);
            end_weight = max(luminance(reflection), luminance(radiance));
            truncated = luminance(through * (f * pr.truncated + (vec3f(1.0) - f) * pt.truncated));
        } else {
            let d = ray.dir;
            let x = refraction_crossing(start, d, hit, c, stack);
            if (!x.crosses) {
                let r = refraction_path(refraction_departure(x.p, x.nf, d), d, x.after, -1, 1u, state);
                radiance = through * r.radiance;
                end = r.end;
                end_weight = luminance(radiance);
                truncated = luminance(through * r.truncated);
            } else {
                // Primeira interface: a mesma microfaceta para os dois lobos; o Fresnel por canal.
                let u = vec2f(refraction_random(state), refraction_random(state));
                let m = refraction_microfacet(d, x.nf, x.alpha, u);
                let cos_m = dot(-d, m);
                let f = vec3f(
                    refraction_fresnel(cos_m, x.before.ior.x, x.next.ior.x),
                    refraction_fresnel(cos_m, x.before.ior.y, x.next.ior.y),
                    refraction_fresnel(cos_m, x.before.ior.z, x.next.ior.z),
                );
                let r = refraction_reflect(d, m, x.nf, x.alpha);
                if (r.weight > 0.0) {
                    let pr = refraction_path(refraction_departure(x.p, x.nf, r.dir), r.dir, stack, -1, 1u, state);
                    reflection = through * f * r.weight * pr.radiance;
                    end = pr.end;
                    end_weight = luminance(reflection);
                    truncated += luminance(through * f * r.weight * pr.truncated);
                }
                if (refraction_dispersive(x.before) || refraction_dispersive(x.next)) {
                    for (var k = 0; k < 3; k++) {
                        let t = refraction_transmit(d, m, x.nf, x.before.ior[k], x.next.ior[k], x.alpha);
                        if (t.weight <= 0.0) { continue; }
                        let pt = refraction_path(refraction_departure(x.p, x.nf, t.dir), t.dir, x.after, k, 1u, state);
                        let w = through[k] * (1.0 - f[k]) * t.weight;
                        radiance[k] = w * pt.radiance[k];
                        // Por canal, a luminância do que ele soma: o caminho do canal mais forte.
                        var only = vec3f(0.0);
                        only[k] = radiance[k];
                        if (luminance(only) > end_weight) {
                            end = pt.end;
                            end_weight = luminance(only);
                        }
                        var lost = vec3f(0.0);
                        lost[k] = w * pt.truncated[k];
                        truncated += luminance(lost);
                    }
                } else {
                    let t = refraction_transmit(d, m, x.nf, x.before.ior.y, x.next.ior.y, x.alpha);
                    if (t.weight > 0.0) {
                        let pt = refraction_path(refraction_departure(x.p, x.nf, t.dir), t.dir, x.after, -1, 1u, state);
                        let w = through * (1.0 - f.y) * t.weight;
                        radiance = w * pt.radiance;
                        if (luminance(radiance) > end_weight) {
                            end = pt.end;
                            end_weight = luminance(radiance);
                        }
                        truncated += luminance(w * pt.truncated);
                    }
                }
            }
        }
    }
    return RefractionSample(radiance + reflection, truncated, end, end_weight);
}
