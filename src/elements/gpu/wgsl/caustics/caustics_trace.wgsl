// Fótons das cáusticas (spec 034, T067c; antes na GI, spec 033 US5): cada invocação lança um fóton de uma fonte
// escolhida pela potência (todos levam a mesma potência: a vazão é a fração dela que segue) — das direcionais só sobre a
// projeção das caixas dos alvos (`caustics_targets_main`, a cada quadro: as instâncias de vidro e metal liso pelo próprio
// material no centro delas, avaliado na onda dos acertos por `caustics_instances_main` e a caixa dos volumes atravessados por raios, a água), escolhidas pela área, a potência
// dividida pelo número de projeções que cobrem o ponto; das pontuais em direções uniformes. O fóton segue pelo mesmo
// acerto da refração (`refraction_scene_hit`: a malha ou a superfície de um volume) e o fechamento do grafo nele
// (avaliado na onda dos acertos): numa interface dielétrica reflete ou refrata pelo Fresnel exato entre o meio em que está
// (o ar, ou a água) e o do outro lado — os três canais pelo mesmo caminho; numa interface com dispersão, um passe por
// canal desde a fonte com o mesmo sorteio, o índice de cada um (sem ruído de cor: os três só se separam onde os índices
// diferem); no metal liso reflete com a cor dele; os trechos atenuam pelos volumes (`ray_volume_transmittance`: a absorção dentro
// da água, a névoa). Na primeira superfície difusa depois de ao menos uma especular deposita a vazão no hash e para — a
// luz direta que não passou por nada especular é a das luzes, e a que atravessa a água chega nelas em linha reta: o
// fóton cuja linha reta cruza a água subtrai essa parcela onde ela chegaria (`caustics_emit`, a variável de controle).
// O meio da atmosfera (`light_transmission`) entra no ponto de onde o fóton sai. A invocação 0 guarda no cabeçalho a potência por fóton do quadro e a contagem do anterior.
// Os rebotes em rodadas pela onda dos acertos (spec 039): a emissão põe os fótons na fila; cada rodada traça os fótons
// vivos em blocos do tamanho da onda (`caustics_photon_hit_main`), avalia o material por classe fora do traçado e segue
// (`caustics_photon_follow_main`), até as rodadas do `CausticsFlow` (`CAUSTICS_BOUNCES`).
// Requer: WORKGROUP_SIZE, NONE, caustics, caustics_common, caustics_hash_atomic, caustics_targets,
// caustics_instance_capable, caustics_photons, caustics_queue, caustics_args_out, caustics_args, CausticsPhoton, bsdf, random, basis,
// sampling, lights, light_transmission, ray_scene, refraction_scene, ray_wave, ray_volume_hit, ray_volume_transmittance,
// ray_volume_bounds, ray_volume_occupied.

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

// A fila dos fótons vivos (spec 039): `caustics_queue` (atômicos) — [0] a lista corrente (0 ou 1), [1] e [2] as contagens
// das duas listas, [3] o início do bloco corrente, [4] os fótons extras já alocados (os canais da dispersão); as listas
// (os índices dos fótons) a partir de `CAUSTICS_QUEUE_LISTS`, cada uma com `caustics_photon_slots()` entradas.
const CAUSTICS_QUEUE_LISTS: u32 = 8u;

/** Fótons que a fila comporta: os das invocações e, para a dispersão, dois a mais por invocação. */
fn caustics_photon_slots() -> u32 {
    return arrayLength(&caustics_photons);
}

/** Invocações dos fótons do quadro (os fótons principais, um por invocação). */
fn caustics_photon_count() -> u32 {
    return u32(f32(caustics.counts.z));
}

/** Põe o fóton `slot` na lista `list`. */
fn caustics_queue_push(list: u32, slot: u32) {
    let k = atomicAdd(&caustics_queue[1u + list], 1u);
    if (k >= caustics_photon_slots()) { return; }
    atomicStore(&caustics_queue[CAUSTICS_QUEUE_LISTS + list * caustics_photon_slots() + k], slot);
}

/** O fóton na posição `k` da lista `list`. */
fn caustics_queue_at(list: u32, k: u32) -> u32 {
    return atomicLoad(&caustics_queue[CAUSTICS_QUEUE_LISTS + list * caustics_photon_slots() + k]);
}

/** Um fóton novo na fonte: a posição, a direção, a vazão e o estado do sorteio, nos três canais. */
fn caustics_photon_start(slot: u32, seed: u32, o: vec3f, d: vec3f, rgb: vec3f) {
    var ph: CausticsPhoton;
    ph.origin = o;
    ph.medium = 1.0;
    ph.dir = d;
    ph.side = -1;
    ph.throughput = rgb;
    ph.channel = 3u;
    ph.state = seed;
    ph.specular = 0u;
    caustics_photons[slot] = ph;
    caustics_queue_push(0u, slot);
}

/**
 * Um fóton da luz `light` em (o, d) com a vazão `light_rgb` (o estado do sorteio `seed`): a correção da luz direta que
 * atravessa a água (a variável de controle: a linha reta subtrai onde a direta já leva, sem material) e o fóton na fila
 * (`slot`) — o meio da atmosfera (`light_transmission`) no ponto de onde ele sai, acima de tudo (na primeira superfície,
 * a consulta de "a luz atravessou a água até aqui" acertaria a própria superfície).
 */
fn caustics_straight(light: u32, o: vec3f, d: vec3f, light_rgb: vec3f) {
    let straight = ray_scene_hit(o, d, 1e6);
    if (straight.instance != NONE && straight.face >= 0.0 && ray_volume_hit(o, d, straight.t, -1).hit) {
        caustics_deposit(straight.position, straight.normal, -light_rgb * light_transmission(light, straight.position), 1.0);
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

/**
 * Uma invocação por fóton principal: a fonte pela potência, o ponto e a direção, a correção da linha reta e o fóton na
 * fila. Na caixa dos volumes, das tentativas aceitas a correção vale para todas e segue uma, sorteada por igual com o peso
 * do número delas (sem viés: a fila tem um fóton por invocação). A invocação 0 guarda no cabeçalho do hash a potência
 * por fóton do quadro e a contagem do anterior.
 */
@compute @workgroup_size(WORKGROUP_SIZE)
fn caustics_trace_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let i = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    let count = caustics_photon_count();
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
        let seed = random_next(&state);
        let o = src.position.xyz;
        caustics_straight(light, o, d, color);
        caustics_photon_start(i, seed, o, d, color * light_transmission(light, o));
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
    var keep_seed = 0u;
    var keep_o = vec3f(0.0);
    var keep_rgb = vec3f(0.0);
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
        let rgb = color / (max(cover, 1.0) * f32(tries));
        let seed = random_next(&state);
        caustics_straight(light, o, d, rgb);
        // Uma das aceitas, por igual (reservatório de uma), por um número independente do sorteio do fóton (o estado
        // seguinte ao da semente seria o primeiro número dele).
        let pick_one = f32(pcg_hash(seed ^ 0x68bc21ebu) & 0xFFFFFFu) / 16777216.0;
        if (pick_one * f32(accepted) < 1.0) {
            keep_seed = seed;
            keep_o = o;
            keep_rgb = rgb * light_transmission(light, o);
        }
    }
    if (accepted > 0u) { caustics_photon_start(i, keep_seed, keep_o, d, keep_rgb * f32(accepted)); }
    if (volume) {
        atomicAdd(&caustics_hash_atomic[CAUSTICS_TRIES], tries);
        atomicAdd(&caustics_hash_atomic[CAUSTICS_ACCEPTED], accepted);
    }
}

/** Zera a fila antes da emissão: a lista 0 corrente, as contagens, o bloco e os extras. */
@compute @workgroup_size(1)
fn caustics_queue_reset_main() {
    for (var k = 0u; k < CAUSTICS_QUEUE_LISTS; k++) { atomicStore(&caustics_queue[k], 0u); }
}

/**
 * O começo de uma rodada: a lista seguinte vazia e o primeiro bloco da corrente (`caustics_args`: o despacho dos fótons
 * do bloco, até `CAUSTICS_WAVE` deles — a capacidade da onda).
 */
@compute @workgroup_size(1)
fn caustics_round_main() {
    let current = atomicLoad(&caustics_queue[0]);
    atomicStore(&caustics_queue[2u - current], 0u);
    atomicStore(&caustics_queue[3], 0u);
    caustics_chunk_args(current, 0u);
}

/** O bloco seguinte da rodada. */
@compute @workgroup_size(1)
fn caustics_chunk_main() {
    let current = atomicLoad(&caustics_queue[0]);
    let start = atomicLoad(&caustics_queue[3]) + CAUSTICS_WAVE;
    atomicStore(&caustics_queue[3], start);
    caustics_chunk_args(current, start);
}

/** O fim da rodada: a lista seguinte vira a corrente. */
@compute @workgroup_size(1)
fn caustics_swap_main() {
    atomicStore(&caustics_queue[0], 1u - atomicLoad(&caustics_queue[0]));
}

/** Os argumentos do despacho do bloco que começa em `start` da lista `list`. */
fn caustics_chunk_args(list: u32, start: u32) {
    let live = min(atomicLoad(&caustics_queue[1u + list]), caustics_photon_slots());
    let n = select(0u, min(live - start, CAUSTICS_WAVE), live > start);
    let groups = (n + WORKGROUP_SIZE - 1u) / WORKGROUP_SIZE;
    caustics_args_out[0] = min(groups, CAUSTICS_MAX_X);
    caustics_args_out[1] = select(1u, (groups + CAUSTICS_MAX_X - 1u) / CAUSTICS_MAX_X, groups > 0u);
    caustics_args_out[2] = select(0u, 1u, groups > 0u);
    caustics_args_out[3] = n;
}

/** Grupos por dimensão do despacho (o limite do dispositivo). */
override CAUSTICS_MAX_X: u32 = 65535u;
/** Fótons por bloco: a capacidade da onda. */
override CAUSTICS_WAVE: u32 = 65536u;

/** O fóton da posição `j` do bloco corrente (`NONE` além do bloco). */
fn caustics_chunk_photon(j: u32) -> u32 {
    if (j >= caustics_args[3]) { return NONE; }
    let current = atomicLoad(&caustics_queue[0]);
    return caustics_queue_at(current, atomicLoad(&caustics_queue[3]) + j);
}

/**
 * Um rebote: o acerto de cada fóton do bloco (o da refração: a malha ou a superfície de um volume) na onda, com a carga
 * (o lado da face, se é volume); a vazão atenuada pelos volumes do trecho. O que escapa sai da fila.
 */
fn caustics_photon_hit_one(j: u32) {
    ray_volume_begin();
    let slot = caustics_chunk_photon(j);
    if (slot == NONE) { return; }
    let ph = caustics_photons[slot];
    let hit = refraction_scene_hit(ph.origin, ph.dir, 1e6, ph.side);
    if (hit.t >= 1e6 || hit.instance == NONE) {
        ray_wave_put_empty(j, vec4f(0.0));
        return;
    }
    caustics_photons[slot].throughput = ph.throughput * ray_volume_transmittance(ph.origin, ph.dir, hit.t, caustics.extra.y);
    refraction_wave_put(j, hit, caustics.extra.y,
        vec4f(hit.face, select(0.0, 1.0, refraction_is_volume(hit.instance)), 0.0, 1.0));
}

/** O acerto dos fótons do bloco — os grupos do despacho percorrem os do bloco em passo de grade. */
@compute @workgroup_size(WORKGROUP_SIZE)
fn caustics_photon_hit_main(@builtin(global_invocation_id) gid: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let n = caustics_args[3];
    for (var j = gid.x; j < n; j += nwg.x * WORKGROUP_SIZE) { caustics_photon_hit_one(j); }
}

/**
 * Segue o fóton `ph` na interface do acerto (o ponto `p`, a normal `n`, o lado `outside`, se é volume) com o fechamento
 * `c` dele: numa interface dielétrica reflete ou refrata pelo Fresnel exato entre o meio em que está (o ar, ou a água) e o
 * do outro lado; no metal liso reflete com a cor dele; na difusa deposita se chegou por um caminho especular (a direta
 * sem nada especular é a das luzes) e para. Devolve o fóton seguido (`CAUSTICS_STOPPED` no canal: parou).
 */
fn caustics_photon_step(ph0: CausticsPhoton, c: Closure, p: vec3f, n: vec3f, outside: bool, volume: bool, ior: f32,
    u: f32) -> CausticsPhoton {
    var ph = ph0;
    if (c.transmission_weight > 0.5 && c.transmission_roughness < CAUSTICS_ROUGH) {
        // Os dois lados: o volume (a água) faz fronteira com o ar; a malha, com o meio em que o fóton está.
        let around = select(ph.medium, 1.0, volume);
        let n1 = select(ior, around, outside);
        let n2 = select(around, ior, outside);
        let nn = select(-n, n, outside);
        let cosi = clamp(-dot(ph.dir, nn), 0.0, 1.0);
        let t = refract(ph.dir, nn, n1 / n2);
        if (dot(t, t) < 1e-8 || u < bsdf_f_dielectric(cosi, n2 / n1)) {
            ph.dir = reflect(ph.dir, nn);
            ph.origin = p + nn * 1e-4;
            ph.side = select(-1, select(1, 0, outside), volume);
        } else {
            ph.dir = normalize(t);
            ph.origin = p - nn * 1e-4;
            // O vidro absorve pela cor da transmissão ao sair; a água, pelos trechos (`ray_volume_transmittance`).
            if (!outside && !volume) { ph.throughput *= c.transmission_color; }
            if (volume) { ph.medium = select(1.0, ior, outside); }
            ph.side = select(-1, select(0, 1, outside), volume);
        }
        ph.specular++;
        return ph;
    }
    if (c.conductor_weight > 0.5 && c.specular_roughness < CAUSTICS_ROUGH) {
        let nn = select(-n, n, outside);
        let cosi = clamp(-dot(ph.dir, nn), 0.0, 1.0);
        let x = 1.0 - cosi;
        ph.throughput *= c.conductor_f0 + (vec3f(1.0) - c.conductor_f0) * x * x * x * x * x;
        ph.dir = reflect(ph.dir, nn);
        ph.origin = p + nn * 1e-4;
        ph.side = -1;
        ph.specular++;
        return ph;
    }
    if (ph.specular > 0u && outside) {
        caustics_deposit(p, n, ph.throughput, select(1.0 / 3.0, 1.0, ph.channel == 3u));
    }
    ph.channel = CAUSTICS_STOPPED;
    return ph;
}

/** Canal do fóton que parou. */
const CAUSTICS_STOPPED: u32 = 4u;

/**
 * A continuação de um rebote: o fechamento avaliado na onda e o passo do fóton; o que segue vai para a lista seguinte.
 * Numa interface com dispersão nos três canais, o fóton vira três (um por canal: o índice de cada um, a vazão do canal e
 * o mesmo estado do sorteio — o que a repetição desde a fonte daria, os três só se separam onde os índices diferem): o
 * canal 0 fica no fóton e os outros dois em extras alocados na fila.
 */
fn caustics_photon_follow_one(j: u32) {
    ray_volume_begin();
    let slot = caustics_chunk_photon(j);
    if (slot == NONE) { return; }
    let e = ray_wave_entries[j];
    if (e.hit.payload.w <= 0.0) { return; }
    let c = e.closure;
    let outside = e.hit.payload.x >= 0.0;
    let volume = e.hit.payload.y > 0.5;
    var ph = caustics_photons[slot];
    let next = 1u - atomicLoad(&caustics_queue[0]);
    var state = ph.state;
    let dispersive = c.transmission_weight > 0.5 && c.transmission_roughness < CAUSTICS_ROUGH && c.transmission_abbe > 0.0;
    if (dispersive && ph.channel == 3u) {
        let iors = closure_dispersion_iors(c.transmission_ior, c.transmission_abbe);
        let u = caustics_random(&state);
        for (var k = 0u; k < 3u; k++) {
            var channel = ph;
            channel.channel = k;
            channel.state = state;
            channel.throughput *= vec3f(f32(k == 0u), f32(k == 1u), f32(k == 2u));
            let moved = caustics_photon_step(channel, c, e.hit.position, e.hit.normal, outside, volume, iors[k], u);
            var at = slot;
            if (k > 0u) {
                let extra = atomicAdd(&caustics_queue[4], 1u);
                at = caustics_photon_count() + extra;
                if (at >= caustics_photon_slots()) { continue; }
            }
            caustics_photons[at] = moved;
            if (moved.channel != CAUSTICS_STOPPED) { caustics_queue_push(next, at); }
        }
        return;
    }
    var ior = c.transmission_ior;
    if (c.transmission_abbe > 0.0 && ph.channel < 3u) {
        ior = closure_dispersion_iors(c.transmission_ior, c.transmission_abbe)[ph.channel];
    }
    let transmissive = c.transmission_weight > 0.5 && c.transmission_roughness < CAUSTICS_ROUGH;
    let u = select(0.0, caustics_random(&state), transmissive);
    ph.state = state;
    let moved = caustics_photon_step(ph, c, e.hit.position, e.hit.normal, outside, volume, ior, u);
    caustics_photons[slot] = moved;
    if (moved.channel != CAUSTICS_STOPPED) { caustics_queue_push(next, slot); }
}

/** A continuação dos fótons do bloco — os grupos do despacho percorrem os do bloco em passo de grade. */
@compute @workgroup_size(WORKGROUP_SIZE)
fn caustics_photon_follow_main(@builtin(global_invocation_id) gid: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let n = caustics_args[3];
    for (var j = gid.x; j < n; j += nwg.x * WORKGROUP_SIZE) { caustics_photon_follow_one(j); }
}
