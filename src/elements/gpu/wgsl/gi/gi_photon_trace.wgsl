// Fótons das cáusticas (spec 033, US5; R2): cada invocação lança um fóton de uma fonte escolhida pela potência (todos
// levam a mesma potência: a vazão é a fração dela que segue) — das direcionais só sobre a projeção das caixas das
// instâncias capazes de cáustica (`gi_photon_targets_main`, a cada quadro: vidro e metal liso pelo próprio material no
// centro delas), escolhidas pela área, a potência dividida pelo número de projeções que cobrem o ponto (sem contar duas
// vezes onde se sobrepõem); das pontuais em direções uniformes. O fóton segue pela estrutura de raios: no vidro
// (transmissão) reflete ou refrata pelo Fresnel (escolha aleatória), no metal liso reflete com a cor dele; na primeira
// superfície difusa depois de ao menos uma especular deposita a vazão no hash (`gi_photon.wgsl`) e para. O que bate
// direto numa difusa é a luz direta (já desenhada) e o que entra na água fica com as cáusticas dela (a água da 017).
// A invocação 0 guarda no cabeçalho a potência por fóton do quadro e a contagem do quadro anterior.
// Requer: WORKGROUP_SIZE, NONE, gi, gi_photon_common, gi_caustics_atomic, gi_direct (gi_hash,
// lights, light_incoming, light_transmission), ray_hit, ray_scene, ray_bvh_read, ray_volume_hit, ray_volume_transmittance,
// gi_photon_targets.

const GI_PHOTON_BOUNCES: u32 = 6u;
/** Instâncias-alvo dos fótons (no máximo) e luzes com áreas acumuladas. */
const GI_PHOTON_TARGETS: u32 = 64u;
const GI_PHOTON_TARGET_LIGHTS: u32 = 8u;
// Layout de `gi_photon_targets` (f32): [0] contagem; [8 + 8k ..] a caixa da instância k (lo xyz, 0, hi xyz, 0);
// [8 + 8·64 + 64·l + k] a área acumulada da projeção para a luz l até a instância k.
const GI_PHOTON_AREAS: u32 = 520u;

fn gi_photon_random(state: ptr<function, u32>) -> f32 {
    return f32(random_next(state) & 0xFFFFFFu) / 16777216.0;
}

/** Base ortonormal em volta de `d` (o eixo auxiliar y, ou x perto dele). */
fn gi_photon_basis(d: vec3f) -> mat3x3f {
    return basis_cross(d, select(vec3f(0.0, 1.0, 0.0), vec3f(1.0, 0.0, 0.0), abs(d.y) > 0.9));
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

/** Potência da luz `i` que os fótons levam (direcional: irradiância × área das projeções dos alvos; pontual: × 4π). */
fn gi_photon_power(i: u32) -> f32 {
    let light = lights[i];
    let e = light.intensity * max(max(light.color.r, light.color.g), light.color.b);
    if (light.kind == 0u) {
        let count = u32(gi_photon_targets[0]);
        if (count == 0u || i >= GI_PHOTON_TARGET_LIGHTS) { return 0.0; }
        return e * gi_photon_targets[GI_PHOTON_AREAS + i * GI_PHOTON_TARGETS + count - 1u];
    }
    return e * 4.0 * PI;
}

fn gi_photon_target_box(k: u32) -> array<vec3f, 2> {
    let w = 8u + 8u * k;
    return array<vec3f, 2>(
        vec3f(gi_photon_targets[w], gi_photon_targets[w + 1u], gi_photon_targets[w + 2u]),
        vec3f(gi_photon_targets[w + 4u], gi_photon_targets[w + 5u], gi_photon_targets[w + 6u]),
    );
}

var<workgroup> gi_photon_wg_count: atomic<u32>;
var<workgroup> gi_photon_wg_list: array<u32, GI_PHOTON_TARGETS>;

/** Um grupo: as instâncias capazes de cáustica, as caixas em mundo e as áreas das projeções por luz direcional. */
@compute @workgroup_size(WORKGROUP_SIZE)
fn gi_photon_targets_main(@builtin(local_invocation_index) lid: u32) {
    if (lid == 0u) { atomicStore(&gi_photon_wg_count, 0u); }
    workgroupBarrier();
    let instances = ray_scene_info.instanceCount;
    for (var k = lid; k < instances; k += WORKGROUP_SIZE) {
        let inst = ray_instance_at(ray_scene_info.instanceFirst + k * RAY_INSTANCE_WORDS);
        if (inst.ids.z == RAY_KIND_VOLUME) { continue; }
        let root = ray_node(ray_blas_a(ray_scene_info.blasFirst + inst.ids.x * RAY_BLAS_WORDS).x, 0u);
        let center = (inst.toWorld * vec4f(0.5 * (root.lo + root.hi), 1.0)).xyz;
        let m = StandardMaterial(vec4f(inst.material0.rgb, 1.0), inst.material0.w, bitcast<f32>(inst.material1.x), 0.0, 0.0);
        let sample = SurfaceSample(center, vec3f(0.0, 1.0, 0.0), vec2f(0.5), gi.extra.w, vec3f(0.0), vec4f(0.0), vec3f(0.0), 0.0, vec2f(0.0), vec2f(0.0));
        // O material composto no centro da instância.
        if (!gi_photon_caustic_capable(ray_hit_material(inst.ids.w & 0xFFFFu, sample, m, inst.material1.y))) { continue; }
        let slot = atomicAdd(&gi_photon_wg_count, 1u);
        if (slot < GI_PHOTON_TARGETS) { gi_photon_wg_list[slot] = k; }
    }
    workgroupBarrier();
    let count = min(atomicLoad(&gi_photon_wg_count), GI_PHOTON_TARGETS);
    // As caixas em mundo (os 8 cantos da caixa de objeto pela matriz da instância).
    for (var j = lid; j < count; j += WORKGROUP_SIZE) {
        let inst = ray_instance_at(ray_scene_info.instanceFirst + gi_photon_wg_list[j] * RAY_INSTANCE_WORDS);
        let root = ray_node(ray_blas_a(ray_scene_info.blasFirst + inst.ids.x * RAY_BLAS_WORDS).x, 0u);
        var lo = vec3f(1e30);
        var hi = vec3f(-1e30);
        for (var c = 0u; c < 8u; c++) {
            let corner = select(root.lo, root.hi, vec3<bool>((c & 1u) != 0u, (c & 2u) != 0u, (c & 4u) != 0u));
            let q = (inst.toWorld * vec4f(corner, 1.0)).xyz;
            lo = min(lo, q);
            hi = max(hi, q);
        }
        let w = 8u + 8u * j;
        gi_photon_targets[w] = lo.x;
        gi_photon_targets[w + 1u] = lo.y;
        gi_photon_targets[w + 2u] = lo.z;
        gi_photon_targets[w + 4u] = hi.x;
        gi_photon_targets[w + 5u] = hi.y;
        gi_photon_targets[w + 6u] = hi.z;
    }
    workgroupBarrier();
    let lightCount = min(min(gi.counts.x, arrayLength(&lights)), GI_PHOTON_TARGET_LIGHTS);
    if (lid < lightCount && lights[lid].kind == 0u) {
        let d = normalize(lights[lid].direction.xyz);
        var acc = 0.0;
        for (var j = 0u; j < count; j++) {
            let box = gi_photon_target_box(j);
            let r = gi_photon_footprint(d, box[0], box[1]);
            acc += max((r.z - r.x) * (r.w - r.y), 0.0);
            gi_photon_targets[GI_PHOTON_AREAS + lid * GI_PHOTON_TARGETS + j] = acc;
        }
    }
    if (lid == 0u) { gi_photon_targets[0] = f32(count); }
}

/**
 * Deposita a vazão `rgb` (frações da potência por fóton) nas 8 células em volta de `p`, com os pesos trilineares (a
 * mesma interpolação da leitura: a cáustica sai contínua, sem os blocos das células).
 */
fn gi_photon_deposit(p: vec3f, rgb: vec3f) {
    let g = p / gi.extra.y - 0.5;
    let base = vec3i(floor(g));
    let f = g - vec3f(base);
    for (var k = 0u; k < 8u; k++) {
        let o = vec3i(i32(k & 1u), i32((k >> 1u) & 1u), i32(k >> 2u));
        let w = mix(vec3f(1.0) - f, f, vec3f(o));
        gi_photon_deposit_cell(base + o, rgb * (w.x * w.y * w.z));
    }
}

/** Soma `rgb` na célula `c`. */
fn gi_photon_deposit_cell(c: vec3i, rgb: vec3f) {
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
    var total = 0.0;
    for (var l = 0u; l < lightCount; l++) { total += gi_photon_power(l); }
    if (i == 0u) {
        atomicStore(&gi_caustics_atomic[0], bitcast<u32>(total / max(f32(count), 1.0)));
        atomicStore(&gi_caustics_atomic[1], atomicLoad(&gi_caustics_atomic[2]));
        atomicStore(&gi_caustics_atomic[2], 0u);
    }
    if (i >= count || gi.bounces.w == 0u || total <= 0.0 || ray_scene_info.instanceCount == 0u) { return; }
    var state = random_seed(RANDOM_STREAM_GI_PHOTON, i, gi.rays.y);
    // A fonte pela potência.
    let pick = gi_photon_random(&state) * total;
    var light = 0u;
    var acc = 0.0;
    for (var l = 0u; l < lightCount; l++) {
        acc += gi_photon_power(l);
        light = l;
        if (pick < acc) { break; }
    }
    let src = lights[light];
    var o: vec3f;
    var d: vec3f;
    var weight = 1.0;
    if (src.kind == 0u) {
        // Direcional: um alvo pela área da projeção da caixa dele, um ponto nela, recuado para fora; a potência dividida
        // pelas projeções que cobrem o ponto (onde elas se sobrepõem, os fótons vêm de mais de uma).
        d = normalize(src.direction.xyz);
        let b = gi_photon_basis(d);
        let count = u32(gi_photon_targets[0]);
        let areas = GI_PHOTON_AREAS + light * GI_PHOTON_TARGETS;
        let pickArea = gi_photon_random(&state) * gi_photon_targets[areas + count - 1u];
        var chosen = 0u;
        for (var j = 0u; j < count; j++) {
            chosen = j;
            if (pickArea < gi_photon_targets[areas + j]) { break; }
        }
        let box = gi_photon_target_box(chosen);
        let r = gi_photon_footprint(d, box[0], box[1]);
        let uv = mix(r.xy, r.zw, vec2f(gi_photon_random(&state), gi_photon_random(&state)));
        var cover = 0.0;
        for (var j = 0u; j < count; j++) {
            let bj = gi_photon_target_box(j);
            let rj = gi_photon_footprint(d, bj[0], bj[1]);
            if (all(uv >= rj.xy) && all(uv <= rj.zw)) { cover += 1.0; }
        }
        weight = 1.0 / max(cover, 1.0);
        let back = length(box[1] - box[0]) + 1.0;
        o = b[0] * uv.x + b[1] * uv.y + d * (dot(0.5 * (box[0] + box[1]), d) - back);
    } else {
        o = src.position.xyz;
        d = sample_sphere(vec2f(gi_photon_random(&state), gi_photon_random(&state)));
    }
    let color = src.color.rgb / max(max(src.color.r, src.color.g), max(src.color.b, 1e-6));
    var throughput = color * weight;
    var specular = 0u;
    // Cor do fóton depois de um material com dispersão (3 = as três juntas).
    var channel = 3u;
    for (var bounce = 0u; bounce < GI_PHOTON_BOUNCES; bounce++) {
        let hit = ray_scene_hit(o, d, 1e6);
        let water = ray_volume_hit(o, d, min(hit.t, 1e6));
        if (water.hit) { return; }
        if (hit.t >= 1e6 || hit.instance == NONE) { return; }
        // Os meios atravessados no trecho (a névoa) atenuam o fóton.
        throughput *= ray_volume_transmittance(o, d, hit.t, gi.extra.w);
        let c = ray_hit_closure(hit, gi.extra.w, 0.0);
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
