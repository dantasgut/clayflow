// Fótons das cáusticas (spec 033, US5; R2): cada invocação lança um fóton de uma fonte escolhida pela potência (todos
// levam a mesma potência: a vazão é a fração dela que segue) — das direcionais por uma grade estratificada sobre a
// projeção da caixa da cena, das pontuais em direções uniformes. O fóton segue pela estrutura de raios: no vidro
// (transmissão) reflete ou refrata pelo Fresnel (escolha aleatória), no metal liso reflete com a cor dele; na primeira
// superfície difusa depois de ao menos uma especular deposita a vazão no hash (`gi_photon.wgsl`) e para. O que bate
// direto numa difusa é a luz direta (já desenhada) e o que entra na água fica com as cáusticas dela (a água da 017).
// A invocação 0 guarda no cabeçalho a potência por fóton do quadro e a contagem do quadro anterior.
// Requer: WORKGROUP_SIZE, NONE, gi, gi_photon_common, gi_caustics_atomic, gi_direct (gi_hash,
// lights, light_incoming, light_transmission), gi_hit, ray_scene, ray_bvh_read, ray_volume_hit.

const GI_PHOTON_BOUNCES: u32 = 6u;
const GI_PHOTON_ROUGH: f32 = 0.3;

fn gi_photon_random(state: ptr<function, u32>) -> f32 {
    *state = gi_hash(*state + 0x9e3779b9u);
    return f32(*state & 0xFFFFFFu) / 16777216.0;
}

/** Base ortonormal em volta de `d`. */
fn gi_photon_basis(d: vec3f) -> mat3x3f {
    let up = select(vec3f(0.0, 1.0, 0.0), vec3f(1.0, 0.0, 0.0), abs(d.y) > 0.9);
    let u = normalize(cross(up, d));
    return mat3x3f(u, cross(d, u), d);
}

/** Retângulo da caixa da cena projetada no plano perpendicular a `d`: (min u, min v, max u, max v) e o recuo. */
fn gi_photon_footprint(d: vec3f, lo: vec3f, hi: vec3f) -> vec4f {
    let b = gi_photon_basis(d);
    var r = vec4f(1e30, 1e30, -1e30, -1e30);
    for (var k = 0u; k < 8u; k++) {
        let c = select(lo, hi, vec3<bool>((k & 1u) != 0u, (k & 2u) != 0u, (k & 4u) != 0u));
        let q = vec2f(dot(c, b[0]), dot(c, b[1]));
        r = vec4f(min(r.xy, q), max(r.zw, q));
    }
    return r;
}

/** Potência da luz `i` (direcional: irradiância × área da caixa projetada; pontual: intensidade × 4π). */
fn gi_photon_power(i: u32, lo: vec3f, hi: vec3f) -> f32 {
    let light = lights[i];
    let e = light.intensity * max(max(light.color.r, light.color.g), light.color.b);
    if (light.kind == 0u) {
        let r = gi_photon_footprint(normalize(light.direction.xyz), lo, hi);
        return e * max((r.z - r.x) * (r.w - r.y), 0.0);
    }
    return e * 4.0 * GI_PI;
}

/** Deposita a vazão `rgb` (frações da potência por fóton) na célula de `p`. */
fn gi_photon_deposit(p: vec3f, rgb: vec3f) {
    let c = vec3i(floor(p / gi.extra.y));
    let key = gi_photon_key(c);
    if (key == GI_PHOTON_EMPTY) { return; }
    let n = gi_photon_slots();
    var slot = gi_photon_bucket(c);
    for (var k = 0u; k < 4u * GI_PHOTON_PROBES; k++) {
        let w = gi_photon_word(slot);
        let old = atomicCompareExchangeWeak(&gi_caustics_atomic[w], GI_PHOTON_EMPTY, key);
        if (!old.exchanged && old.old_value == GI_PHOTON_EMPTY) { continue; }
        if (old.exchanged || old.old_value == key) {
            let q = vec3u(round(clamp(rgb, vec3f(0.0), vec3f(16.0)) * GI_PHOTON_ONE));
            atomicAdd(&gi_caustics_atomic[w + 1u], q.r);
            atomicAdd(&gi_caustics_atomic[w + 2u], q.g);
            atomicAdd(&gi_caustics_atomic[w + 3u], q.b);
            return;
        }
        slot = (slot + 1u) % n;
    }
}

@compute @workgroup_size(WORKGROUP_SIZE)
fn gi_photon_trace_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let i = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    let count = u32(gi.extra.z);
    let lightCount = min(min(gi.counts.x, arrayLength(&lights)), LIGHT_LIMIT);
    let root = ray_node(0u, ray_scene_info.tlasRoot);
    let lo = root.lo;
    let hi = root.hi;
    var total = 0.0;
    for (var l = 0u; l < lightCount; l++) { total += gi_photon_power(l, lo, hi); }
    if (i == 0u) {
        atomicStore(&gi_caustics_atomic[0], bitcast<u32>(total / max(f32(count), 1.0)));
        atomicStore(&gi_caustics_atomic[1], atomicLoad(&gi_caustics_atomic[2]));
        atomicStore(&gi_caustics_atomic[2], 0u);
    }
    if (i >= count || gi.bounces.w == 0u || total <= 0.0 || ray_scene_info.instanceCount == 0u) { return; }
    var state = gi_hash(i * 1973u + gi.rays.y * 9277u + 26699u);
    // A fonte pela potência.
    let pick = gi_photon_random(&state) * total;
    var light = 0u;
    var acc = 0.0;
    for (var l = 0u; l < lightCount; l++) {
        acc += gi_photon_power(l, lo, hi);
        light = l;
        if (pick < acc) { break; }
    }
    let src = lights[light];
    var o: vec3f;
    var d: vec3f;
    if (src.kind == 0u) {
        // Direcional: grade estratificada (com o deslocamento do quadro) sobre a caixa projetada, recuada para fora dela.
        d = normalize(src.direction.xyz);
        let b = gi_photon_basis(d);
        let r = gi_photon_footprint(d, lo, hi);
        let side = u32(ceil(sqrt(f32(count))));
        let cell = vec2f(f32(i % side), f32(i / side)) + vec2f(gi_photon_random(&state), gi_photon_random(&state));
        let uv = mix(r.xy, r.zw, cell / f32(side));
        let back = length(hi - lo) + 1.0;
        o = b[0] * uv.x + b[1] * uv.y + d * (dot(0.5 * (lo + hi), d) - back);
    } else {
        let z = 2.0 * gi_photon_random(&state) - 1.0;
        let a = 2.0 * GI_PI * gi_photon_random(&state);
        let s = sqrt(max(0.0, 1.0 - z * z));
        o = src.position.xyz;
        d = vec3f(s * cos(a), s * sin(a), z);
    }
    let color = src.color.rgb / max(max(src.color.r, src.color.g), max(src.color.b, 1e-6));
    var throughput = color;
    var specular = 0u;
    // Cor do fóton depois de um material com dispersão (3 = as três juntas).
    var channel = 3u;
    for (var bounce = 0u; bounce < GI_PHOTON_BOUNCES; bounce++) {
        let hit = ray_scene_hit(o, d, 1e6);
        let water = ray_volume_hit(o, d, min(hit.t, 1e6));
        if (water.hit) { return; }
        if (hit.t >= 1e6 || hit.instance == NONE) { return; }
        let c = gi_hit_closure(hit);
        let n = hit.normal;
        let outside = hit.face >= 0.0;
        let p = hit.position;
        if (c.transmission_weight > 0.5 && c.transmission_roughness < GI_PHOTON_ROUGH) {
            // Interface dielétrica: Fresnel de Schlick; reflete ou refrata.
            // Dispersão: na primeira interface com número de Abbe o fóton fica com uma cor (escolhida ao acaso; a vazão
            // vai ×3 nela) e segue com o IOR dela.
            if (channel == 3u && c.transmission_abbe > 0.0) {
                channel = min(u32(gi_photon_random(&state) * 3.0), 2u);
                throughput *= 3.0 * vec3f(f32(channel == 0u), f32(channel == 1u), f32(channel == 2u));
            }
            var ior = c.transmission_ior;
            if (channel < 3u) { ior = closure_dispersion_iors(c.transmission_ior, c.transmission_abbe)[channel]; }
            let nn = select(-n, n, outside);
            let eta = select(ior, 1.0 / ior, outside);
            let cosi = clamp(-dot(d, nn), 0.0, 1.0);
            let f0 = (ior - 1.0) * (ior - 1.0) / ((ior + 1.0) * (ior + 1.0));
            let x = 1.0 - cosi;
            let fresnel = f0 + (1.0 - f0) * x * x * x * x * x;
            let t = refract(d, nn, eta);
            if (dot(t, t) < 1e-8 || gi_photon_random(&state) < fresnel) {
                d = reflect(d, nn);
                o = p + nn * 1e-4;
            } else {
                d = normalize(t);
                o = p - nn * 1e-4;
                if (!outside) { throughput *= c.transmission_color; }
            }
            specular++;
            continue;
        }
        if (c.conductor_weight > 0.5 && c.specular_roughness < GI_PHOTON_ROUGH) {
            let nn = select(-n, n, outside);
            let cosi = clamp(-dot(d, nn), 0.0, 1.0);
            let x = 1.0 - cosi;
            throughput *= c.conductor_f0 + (vec3f(1.0) - c.conductor_f0) * x * x * x * x * x;
            d = reflect(d, nn);
            o = p + nn * 1e-4;
            specular++;
            continue;
        }
        // Difusa: deposita se a luz chegou por um caminho especular (o direto já está desenhado).
        if (specular > 0u && outside) {
            gi_photon_deposit(p, throughput * light_transmission(light, p));
        }
        return;
    }
}
