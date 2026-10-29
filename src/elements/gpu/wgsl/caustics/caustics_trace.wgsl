// Fótons das cáusticas (spec 034, T067c; antes na GI, spec 033 US5): cada invocação lança um fóton de uma fonte
// escolhida pela potência (todos levam a mesma potência: a vazão é a fração dela que segue) — das direcionais só sobre a
// projeção das caixas dos alvos (`caustics_targets_main`, a cada quadro: as instâncias de vidro e metal liso pelo próprio
// material no centro delas, avaliado na onda dos acertos por `caustics_instances_main` e a caixa dos volumes atravessados por raios, a água), escolhidas pela área, a potência
// dividida pelo número de projeções que cobrem o ponto; das pontuais em direções uniformes. O fóton segue pelo mesmo
// acerto da refração (`refraction_scene_hit`: a malha ou a superfície de um volume) e o fechamento do grafo nele
// (`refraction_hit_closure`): numa interface dielétrica reflete ou refrata pelo Fresnel exato entre o meio em que está
// (o ar, ou a água) e o do outro lado — os três canais pelo mesmo caminho; numa interface com dispersão, um passe por
// canal desde a fonte com o mesmo sorteio, o índice de cada um (sem ruído de cor: os três só se separam onde os índices
// diferem); no metal liso reflete com a cor dele; os trechos atenuam pelos volumes (`ray_volume_transmittance`: a absorção dentro
// da água, a névoa). Na primeira superfície difusa depois de ao menos uma especular deposita a vazão no hash e para — a
// luz direta que não passou por nada especular é a das luzes, e a que atravessa a água chega nelas em linha reta: o
// fóton cuja linha reta cruza a água subtrai essa parcela onde ela chegaria (`caustics_emit`, a variável de controle).
// O meio da atmosfera (`light_transmission`) entra no ponto de onde o fóton sai. A invocação 0 guarda no cabeçalho a potência por fóton do quadro e a contagem do anterior.
// Requer: WORKGROUP_SIZE, NONE, caustics, caustics_common, caustics_hash_atomic, caustics_targets,
// caustics_instance_capable, bsdf, random, basis,
// sampling, lights, light_transmission, ray_scene, ray_hit, refraction_scene, ray_volume_hit, ray_volume_transmittance, ray_volume_bounds,
// ray_volume_occupied.

const CAUSTICS_BOUNCES: u32 = 6u;
/** Instâncias-alvo dos fótons (no máximo) e luzes com áreas acumuladas. */
const CAUSTICS_TARGETS: u32 = 64u;
const CAUSTICS_TARGET_LIGHTS: u32 = 8u;
// Layout de `caustics_targets` (f32): [0] contagem; [1] o alvo da caixa dos volumes; [8 + 8k ..] a caixa da instância k (lo xyz, 0, hi xyz, 0);
// [8 + 8·64 + 64·l + k] a área acumulada da projeção para a luz l até a instância k.
const CAUSTICS_AREAS: u32 = 520u;
/** Palavra de `caustics_targets` com o alvo da caixa dos volumes (índice + 1; 0 sem volumes). */
const CAUSTICS_VOLUME_TARGET: u32 = 1u;
/** Teto das amostras por fóton na caixa dos volumes. */
const CAUSTICS_VOLUME_TRIES: u32 = 32u;

fn caustics_random(state: ptr<function, u32>) -> f32 {
    return f32(random_next(state) & 0xFFFFFFu) / 16777216.0;
}

/** Base ortonormal em volta de `d` (o eixo auxiliar y, ou x perto dele). */
fn caustics_basis(d: vec3f) -> mat3x3f {
    return basis_cross(d, select(vec3f(0.0, 1.0, 0.0), vec3f(1.0, 0.0, 0.0), abs(d.y) > 0.9));
}

/** Retângulo da caixa da cena projetada no plano perpendicular a `d`: (min u, min v, max u, max v) e o recuo. */
fn caustics_footprint(d: vec3f, lo: vec3f, hi: vec3f) -> vec4f {
    let b = caustics_basis(d);
    var r = vec4f(1e30, 1e30, -1e30, -1e30);
    for (var k = 0u; k < 8u; k++) {
        let c = select(lo, hi, vec3<bool>((k & 1u) != 0u, (k & 2u) != 0u, (k & 4u) != 0u));
        let q = vec2f(dot(c, b[0]), dot(c, b[1]));
        r = vec4f(min(r.xy, q), max(r.zw, q));
    }
    return r;
}

/** Potência da luz `i` que os fótons levam (direcional: irradiância × área das projeções dos alvos; pontual: × 4π). */
fn caustics_power(i: u32) -> f32 {
    let light = lights[i];
    let e = light.intensity * max(max(light.color.r, light.color.g), light.color.b);
    if (light.kind == 0u) {
        let count = u32(caustics_targets[0]);
        if (count == 0u || i >= CAUSTICS_TARGET_LIGHTS) { return 0.0; }
        return e * caustics_targets[CAUSTICS_AREAS + i * CAUSTICS_TARGETS + count - 1u];
    }
    return e * 4.0 * PI;
}

fn caustics_target_box(k: u32) -> array<vec3f, 2> {
    let w = 8u + 8u * k;
    return array<vec3f, 2>(
        vec3f(caustics_targets[w], caustics_targets[w + 1u], caustics_targets[w + 2u]),
        vec3f(caustics_targets[w + 4u], caustics_targets[w + 5u], caustics_targets[w + 6u]),
    );
}

var<workgroup> caustics_wg_count: atomic<u32>;
var<workgroup> caustics_wg_list: array<u32, CAUSTICS_TARGETS>;

/** Um grupo: as instâncias capazes de cáustica (de `caustics_instances_flag_main`), as caixas em mundo e as áreas das projeções por luz direcional. */
@compute @workgroup_size(WORKGROUP_SIZE)
fn caustics_targets_main(@builtin(local_invocation_index) lid: u32) {
    if (lid == 0u) { atomicStore(&caustics_wg_count, 0u); }
    workgroupBarrier();
    let instances = min(ray_scene_info.instanceCount, arrayLength(&caustics_instance_capable));
    for (var k = lid; k < instances; k += WORKGROUP_SIZE) {
        if (caustics_instance_capable[k] == 0u) { continue; }
        let slot = atomicAdd(&caustics_wg_count, 1u);
        if (slot < CAUSTICS_TARGETS) { caustics_wg_list[slot] = k; }
    }
    workgroupBarrier();
    let count = min(atomicLoad(&caustics_wg_count), CAUSTICS_TARGETS);
    // As caixas em mundo (os 8 cantos da caixa de objeto pela matriz da instância).
    for (var j = lid; j < count; j += WORKGROUP_SIZE) {
        let inst = ray_instance_at(ray_scene_info.instanceFirst + caustics_wg_list[j] * RAY_INSTANCE_WORDS);
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
        caustics_targets[w] = lo.x;
        caustics_targets[w + 1u] = lo.y;
        caustics_targets[w + 2u] = lo.z;
        caustics_targets[w + 4u] = hi.x;
        caustics_targets[w + 5u] = hi.y;
        caustics_targets[w + 6u] = hi.z;
    }
    workgroupBarrier();
    // A caixa dos volumes (a água) como mais um alvo.
    if (lid == 0u) {
        let vb = ray_volume_bounds();
        var total = count;
        caustics_targets[CAUSTICS_VOLUME_TARGET] = 0.0;
        if (all(vb[0] < vb[1]) && total < CAUSTICS_TARGETS) {
            caustics_targets[CAUSTICS_VOLUME_TARGET] = f32(total + 1u);
            let w = 8u + 8u * total;
            caustics_targets[w] = vb[0].x;
            caustics_targets[w + 1u] = vb[0].y;
            caustics_targets[w + 2u] = vb[0].z;
            caustics_targets[w + 4u] = vb[1].x;
            caustics_targets[w + 5u] = vb[1].y;
            caustics_targets[w + 6u] = vb[1].z;
            total += 1u;
        }
        atomicStore(&caustics_wg_count, total);
    }
    workgroupBarrier();
    let targets = atomicLoad(&caustics_wg_count);
    let lightCount = min(min(caustics.counts.x, arrayLength(&lights)), CAUSTICS_TARGET_LIGHTS);
    if (lid < lightCount && lights[lid].kind == 0u) {
        let d = normalize(lights[lid].direction.xyz);
        var acc = 0.0;
        for (var j = 0u; j < targets; j++) {
            let box = caustics_target_box(j);
            let r = caustics_footprint(d, box[0], box[1]);
            acc += max((r.z - r.x) * (r.w - r.y), 0.0);
            caustics_targets[CAUSTICS_AREAS + lid * CAUSTICS_TARGETS + j] = acc;
        }
    }
    if (lid == 0u) { caustics_targets[0] = f32(targets); }
}

/**
 * Deposita a vazão `rgb` (frações da potência por fóton, com sinal) no ponto `p` de normal `n`, pela tenda 2D no plano tangente,
 * em todos os níveis de células (com o peso da tenda vezes `share` como a contagem do fóton: 1, ou ⅓ por canal).
 */
fn caustics_deposit(p: vec3f, n: vec3f, rgb: vec3f, share: f32) {
    for (var level = 0u; level < CAUSTICS_LEVELS; level++) {
        let t = caustics_tent(p, n, level);
        for (var k = 0u; k < 4u; k++) {
            let w = caustics_tent_weight(t, k);
            caustics_deposit_cell(caustics_tent_cell(t, k), level, rgb * w, w * share);
        }
    }
}

/** Soma `rgb` e a contagem `count` na célula `c` do nível `level`. */
fn caustics_deposit_cell(c: vec3i, level: u32, rgb: vec3f, count: f32) {
    let key = caustics_key(c, level);
    if (key == CAUSTICS_EMPTY || count <= 0.0) { return; }
    let n = caustics_slots();
    var slot = caustics_bucket(c, level);
    for (var k = 0u; k < 4u * CAUSTICS_PROBES; k++) {
        let w = caustics_word(slot);
        let old = atomicCompareExchangeWeak(&caustics_hash_atomic[w], CAUSTICS_EMPTY, key);
        if (!old.exchanged && old.old_value == CAUSTICS_EMPTY) { continue; }
        if (old.exchanged || old.old_value == key) {
            // Com sinal (a parcela da variável de controle): a soma em u32 dá a de complemento de dois.
            let q = bitcast<vec3u>(vec3i(round(clamp(rgb, vec3f(-16.0), vec3f(16.0)) * CAUSTICS_ONE)));
            atomicAdd(&caustics_hash_atomic[w + 1u], q.r);
            atomicAdd(&caustics_hash_atomic[w + 2u], q.g);
            atomicAdd(&caustics_hash_atomic[w + 3u], q.b);
            atomicAdd(&caustics_hash_atomic[w + 7u], u32(round(count * CAUSTICS_ONE)));
            return;
        }
        slot = (slot + 1u) % n;
    }
}

/**
 * Segue o fóton (o, d) de vazão `light` pela cena com o estado do sorteio `seed`, nos três canais (`channel` 3) ou num
 * só (0–2, o índice dele na dispersão), e deposita na primeira difusa depois de ao menos uma especular. Verdadeiro, sem
 * depositar, se nos três canais chegou a uma interface com dispersão (quem chama refaz por canal).
 */
fn caustics_follow(seed: u32, origin: vec3f, dir: vec3f, light: vec3f, channel: u32) -> bool {
    var state = seed;
    var o = origin;
    var d = dir;
    var throughput = light;
    if (channel < 3u) { throughput *= vec3f(f32(channel == 0u), f32(channel == 1u), f32(channel == 2u)); }
    var specular = 0u;
    // O índice do meio em que o fóton está (1 no ar; o da água dentro de um volume) e o lado da origem quanto aos
    // volumes (−1 sem saber; 0 fora e 1 dentro ao partir da superfície de um).
    var medium = 1.0;
    var side = -1;
    for (var bounce = 0u; bounce < CAUSTICS_BOUNCES; bounce++) {
        let hit = refraction_scene_hit(o, d, 1e6, side);
        if (hit.t >= 1e6 || hit.instance == NONE) { return false; }
        throughput *= ray_volume_transmittance(o, d, hit.t, caustics.extra.y);
        let p = hit.position;
        let c = refraction_hit_closure(hit, caustics.extra.y);
        let n = hit.normal;
        let outside = hit.face >= 0.0;
        let volume = refraction_is_volume(hit.instance);
        if (c.transmission_weight > 0.5 && c.transmission_roughness < CAUSTICS_ROUGH) {
            var ior = c.transmission_ior;
            if (c.transmission_abbe > 0.0) {
                if (channel == 3u) { return true; }
                ior = closure_dispersion_iors(c.transmission_ior, c.transmission_abbe)[channel];
            }
            // Os dois lados: o volume (a água) faz fronteira com o ar; a malha, com o meio em que o fóton está.
            let around = select(medium, 1.0, volume);
            let n1 = select(ior, around, outside);
            let n2 = select(around, ior, outside);
            let nn = select(-n, n, outside);
            let cosi = clamp(-dot(d, nn), 0.0, 1.0);
            let t = refract(d, nn, n1 / n2);
            if (dot(t, t) < 1e-8 || caustics_random(&state) < bsdf_f_dielectric(cosi, n2 / n1)) {
                d = reflect(d, nn);
                o = p + nn * 1e-4;
                side = select(-1, select(1, 0, outside), volume);
            } else {
                d = normalize(t);
                o = p - nn * 1e-4;
                // O vidro absorve pela cor da transmissão ao sair; a água, pelos trechos (`ray_volume_transmittance`).
                if (!outside && !volume) { throughput *= c.transmission_color; }
                if (volume) { medium = select(1.0, ior, outside); }
                side = select(-1, select(0, 1, outside), volume);
            }
            specular++;
            continue;
        }
        if (c.conductor_weight > 0.5 && c.specular_roughness < CAUSTICS_ROUGH) {
            let nn = select(-n, n, outside);
            let cosi = clamp(-dot(d, nn), 0.0, 1.0);
            let x = 1.0 - cosi;
            throughput *= c.conductor_f0 + (vec3f(1.0) - c.conductor_f0) * x * x * x * x * x;
            d = reflect(d, nn);
            o = p + nn * 1e-4;
            side = -1;
            specular++;
            continue;
        }
        // Difusa: deposita se a luz chegou por um caminho especular (a direta sem nada especular é a das luzes).
        if (specular > 0u && outside) { caustics_deposit(p, n, throughput, select(1.0 / 3.0, 1.0, channel == 3u)); }
        return false;
    }
    return false;
}

/**
 * Um fóton da luz `light` em (o, d) com a vazão `light_rgb`: a correção da luz direta que atravessa a água. A direta
 * das luzes chega em linha reta (`light_transmission`: Fresnel e Beer–Lambert pela água até o ponto); o fóton soma onde
 * a luz chega de fato pelo caminho especular e, se a linha reta dele cruza a água antes da primeira malha, subtrai ali o
 * que a direta já leva (a variável de controle) — com poucos fótons, as duas parcelas se borram juntas e a correção vai a
 * zero (a linha reta), em vez de a luz das gotas se diluir pela área seca em volta; a média é a mesma.
 */
fn caustics_emit(seed: u32, light: u32, o: vec3f, d: vec3f, light_rgb: vec3f) {
    // (Sem o fechamento da malha na linha reta: cada expansão de `ray_hit_material` pesa no kernel; numa malha especular
    // a parcela fica numa célula que nenhuma difusa lê.)
    let straight = ray_scene_hit(o, d, 1e6);
    if (straight.instance != NONE && straight.face >= 0.0 && ray_volume_hit(o, d, straight.t, -1).hit) {
        caustics_deposit(straight.position, straight.normal, -light_rgb * light_transmission(light, straight.position), 1.0);
    }
    // O meio da atmosfera até a cena: no ponto de onde o fóton sai, acima de tudo (na primeira superfície, a consulta
    // de "a luz atravessou a água até aqui" acertaria a própria superfície).
    let rgb = light_rgb * light_transmission(light, o);
    // Os três canais pelo mesmo caminho; numa interface com dispersão, um passe por canal desde a fonte (o mesmo estado
    // do sorteio: os três só se separam onde os índices diferem).
    // Uma chamada só, num laço sem contagem fixa (cada cópia expande o fechamento do material — o laço de 4 desenrolado
    // custava 13× o tempo): os três canais e, se dividiu, um por canal.
    var channel = 3u;
    loop {
        let split = caustics_follow(seed, o, d, rgb, channel);
        if (channel == 3u) {
            if (!split) { break; }
            channel = 0u;
        } else {
            channel++;
            if (channel == 3u) { break; }
        }
    }
}

/**
 * Amostras por fóton na caixa dos volumes: o inverso da fração delas que passou pela água no quadro anterior (1 antes
 * da primeira medida).
 */
fn caustics_volume_tries() -> u32 {
    let ratio = bitcast<f32>(atomicLoad(&caustics_hash_atomic[CAUSTICS_ACCEPTED_RATIO]));
    if (ratio <= 0.0) { return 1u; }
    return u32(clamp(ceil(1.0 / ratio), 1.0, f32(CAUSTICS_VOLUME_TRIES)));
}

@compute @workgroup_size(WORKGROUP_SIZE)
fn caustics_trace_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let i = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    let count = u32(f32(caustics.counts.z));
    let lightCount = min(min(caustics.counts.x, arrayLength(&lights)), LIGHT_LIMIT);
    var total = 0.0;
    for (var l = 0u; l < lightCount; l++) { total += caustics_power(l); }
    if (i == 0u) {
        atomicStore(&caustics_hash_atomic[0], bitcast<u32>(total / max(f32(count), 1.0)));
        atomicStore(&caustics_hash_atomic[1], atomicLoad(&caustics_hash_atomic[2]));
        atomicStore(&caustics_hash_atomic[2], 0u);
    }
    if (i >= count || total <= 0.0 || ray_scene_info.instanceCount == 0u) { return; }
    var state = random_seed(RANDOM_STREAM_CAUSTICS, i, caustics.counts.w);
    // A fonte pela potência.
    let pick = caustics_random(&state) * total;
    var light = 0u;
    var acc = 0.0;
    for (var l = 0u; l < lightCount; l++) {
        acc += caustics_power(l);
        light = l;
        if (pick < acc) { break; }
    }
    let src = lights[light];
    let color = src.color.rgb / max(max(src.color.r, src.color.g), max(src.color.b, 1e-6));
    if (src.kind != 0u) {
        let d = sample_sphere(vec2f(caustics_random(&state), caustics_random(&state)));
        caustics_emit(random_next(&state), light, src.position.xyz, d, color);
        return;
    }
    // Direcional: um alvo pela área da projeção da caixa dele, um ponto nela, recuado para fora; a potência dividida
    // pelas projeções que cobrem o ponto (onde elas se sobrepõem, os fótons vêm de mais de uma).
    let d = normalize(src.direction.xyz);
    let b = caustics_basis(d);
    let targets = u32(caustics_targets[0]);
    let areas = CAUSTICS_AREAS + light * CAUSTICS_TARGETS;
    let pickArea = caustics_random(&state) * caustics_targets[areas + targets - 1u];
    var chosen = 0u;
    for (var j = 0u; j < targets; j++) {
        chosen = j;
        if (pickArea < caustics_targets[areas + j]) { break; }
    }
    let box = caustics_target_box(chosen);
    let r = caustics_footprint(d, box[0], box[1]);
    let back = length(box[1] - box[0]) + 1.0;
    // Na caixa dos volumes, várias amostras de vazão dividida: as que só ela cobre e que não passam por nenhuma água
    // (`ray_volume_occupied`) não seguem — iriam direto a uma difusa, sem nada especular —, e o fóton fica onde há água
    // (as gotas soltas num chão grande recebem fótons bastantes). As tentativas acompanham a fração aceita no quadro
    // anterior: ~1 fóton seguido por invocação.
    let volume = chosen + 1u == u32(caustics_targets[CAUSTICS_VOLUME_TARGET]);
    let tries = select(1u, caustics_volume_tries(), volume);
    var accepted = 0u;
    for (var k = 0u; k < tries; k++) {
        let uv = mix(r.xy, r.zw, vec2f(caustics_random(&state), caustics_random(&state)));
        var cover = 0.0;
        for (var j = 0u; j < targets; j++) {
            let bj = caustics_target_box(j);
            let rj = caustics_footprint(d, bj[0], bj[1]);
            if (all(uv >= rj.xy) && all(uv <= rj.zw)) { cover += 1.0; }
        }
        let o = b[0] * uv.x + b[1] * uv.y + d * (dot(0.5 * (box[0] + box[1]), d) - back);
        if (volume && cover <= 1.0 && !ray_volume_occupied(o, d, 2.0 * back)) { continue; }
        accepted++;
        caustics_emit(random_next(&state), light, o, d, color / (max(cover, 1.0) * f32(tries)));
    }
    if (volume) {
        atomicAdd(&caustics_hash_atomic[CAUSTICS_TRIES], tries);
        atomicAdd(&caustics_hash_atomic[CAUSTICS_ACCEPTED], accepted);
    }
}
