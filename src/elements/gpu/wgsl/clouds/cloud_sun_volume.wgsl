// O volume de τ até o sol perto da câmera (spec 041, T074): as filas das páginas, a escolha do quadro e o desenho. Cada
// nó guarda (r) a profundidade ótica do trecho de `clouds.sunVolume.y` m dele para o sol — a parte do cone curto da luz
// além da primeira amostra (`cloud_sun_depth`), a densidade com o detalhe no meio de `CLOUD_SUN_VOLUME_SAMPLES` partes
// iguais — e (g) o resto da luz do fim do trecho (`cloud_sun_rest`: o pedaço até o meio nó e o nó do mapa visto do sol,
// desenhado antes no quadro): uma aceleração da geometria de agora, refeita quando o que ela guarda muda além da
// tolerância. O registro de cada página (série por páginas da 037, `cloud_sun_volume_records`) guarda a página global, a
// assinatura do conteúdo, o sol e o tempo do desenho, as taxas medidas da mudança das duas partes (|Δτ| médio dos nós de
// prova por metro do deslocamento entre um desenho e o seguinte: no cone, o do fim do trecho, `L·Δθ_sol` mais a deriva do
// detalhe; no resto, `CLOUD_SUN_VOLUME_REST_ARM·Δθ_sol` mais a deriva), o τ médio das provas e os nós de prova; o atlas é
// série por páginas (o carimbo da época de cada página física).
//
// 1. As filas (`cloud_sun_volume_keys_main`, 32 páginas por invocação): para cada página física, a página global da
//    janela de agora do nível dela; vale a que foi desenhada para ela, na época atual e com a assinatura de agora
//    (`cloud_sun_volume_current`), cada parte com a mudança estimada (`cloud_sun_volume_change`: a taxa × o deslocamento
//    desde o desenho e, com a cobertura que evolui, o τ médio × idade ÷ evolução) abaixo de `CLOUD_SUN_VOLUME_INVALID · 2^k`.
//    A fila: a página sem desenho que valha (24…31, as dos níveis finos e perto antes); as demais pela mudança acima de
//    `CLOUD_SUN_VOLUME_TOLERANCE · 2^k` (1…23) — a do resto só quando, no ritmo medido dele, o redesenho vale por pelo
//    menos `CLOUD_SUN_VOLUME_REST_LIFE` s (com o sol andando, o resto não para de mudar, e o orçamento fica para o cone).
// 2. A escolha (um grupo): o orçamento constante (`clouds.sunVolumeGrid.z`), as de fila mais alta antes e, no corte, pela
//    ordem da página; as escolhidas valem no quadro (desenhadas antes da marcha).
// 3. O desenho (um grupo por página da lista): os 9³ nós, as provas e o registro, e o carimbo da série.
// Teto constante: as filas, 32 páginas por invocação; a escolha, 64; o desenho, 3 nós por invocação de
// `CLOUD_SUN_VOLUME_SAMPLES` amostras mais o resto. Espelho de `reference/cloudSunVolume.ts`.
// Requer: cloud_sun_volume_grid, cloud_sun_rest, cloud_common, cloud_density, sky, clouds, page_alloc,
// cloud_sun_volume_out, cloud_sun_volume_work, cloud_sun_volume_records, cloud_sun_volume_stamps, cloud_sun_volume_clock.

const CLOUD_SUN_VOLUME_SAMPLES: u32 = 12u;
const CLOUD_SUN_VOLUME_KEYS_GROUP: u32 = 64u;
const CLOUD_SUN_VOLUME_KEYS_CHUNK: u32 = 32u;
const CLOUD_SUN_VOLUME_SELECT_GROUP: u32 = 256u;
/** Páginas por invocação da escolha (duas palavras de marcas de cada parte, só dela). */
const CLOUD_SUN_VOLUME_SELECT_CHUNK: u32 = 64u;
const CLOUD_SUN_VOLUME_DRAW_GROUP: u32 = 256u;
const CLOUD_SUN_VOLUME_NODES: u32 = 729u;
const CLOUD_SUN_VOLUME_PROBES: u32 = 32u;
/** Índices dos nós de prova: os múltiplos deste entre os 9³ (`sunVolumeProbeNodes`). */
const CLOUD_SUN_VOLUME_PROBE_STEP: u32 = 23u;
const CLOUD_SUN_VOLUME_TOLERANCE: f32 = 0.02;
const CLOUD_SUN_VOLUME_INVALID: f32 = 0.06;
const CLOUD_SUN_VOLUME_RATE: f32 = 0.0029;
const CLOUD_SUN_VOLUME_RATE_FLOOR: f32 = 0.0007;
const CLOUD_SUN_VOLUME_REST_ARM: f32 = 10000.0;
const CLOUD_SUN_VOLUME_REST_RATE: f32 = 0.003;
const CLOUD_SUN_VOLUME_REST_LIFE: f32 = 2.0;
/** A unidade das somas atômicas do desenho (τ em 2⁻¹²: o resto chega a centenas). */
const CLOUD_SUN_VOLUME_UNIT: f32 = 4096.0;
// As palavras do registro de uma página.
const CLOUD_SUN_VOLUME_R_X: u32 = 0u;
const CLOUD_SUN_VOLUME_R_Z: u32 = 1u;
const CLOUD_SUN_VOLUME_R_SIGNATURE: u32 = 2u;
const CLOUD_SUN_VOLUME_R_FRAME: u32 = 3u;
const CLOUD_SUN_VOLUME_R_SUN: u32 = 4u;
const CLOUD_SUN_VOLUME_R_TIME: u32 = 7u;
const CLOUD_SUN_VOLUME_R_RATE: u32 = 8u;
const CLOUD_SUN_VOLUME_R_REST_RATE: u32 = 9u;
const CLOUD_SUN_VOLUME_R_TAU: u32 = 10u;
const CLOUD_SUN_VOLUME_R_REST_TAU: u32 = 11u;
const CLOUD_SUN_VOLUME_R_DRAWN: u32 = 12u;
const CLOUD_SUN_VOLUME_R_PROBES: u32 = 16u;
const CLOUD_SUN_VOLUME_R_REST_PROBES: u32 = 48u;
const CLOUD_SUN_VOLUME_RECORD_WORDS: u32 = 80u;

fn cloud_sun_volume_word(slot: u32, w: u32) -> u32 {
    return cloud_sun_volume_records[slot * CLOUD_SUN_VOLUME_RECORD_WORDS + w];
}

fn cloud_sun_volume_word_f(slot: u32, w: u32) -> f32 {
    return bitcast<f32>(cloud_sun_volume_word(slot, w));
}

fn cloud_sun_volume_set(slot: u32, w: u32, v: u32) {
    cloud_sun_volume_records[slot * CLOUD_SUN_VOLUME_RECORD_WORDS + w] = v;
}

fn cloud_sun_volume_set_f(slot: u32, w: u32, v: f32) {
    cloud_sun_volume_set(slot, w, bitcast<u32>(v));
}

/** O desenho guardado no lugar `slot` é o da página global `g` com o conteúdo de agora, na época atual da série? */
fn cloud_sun_volume_current(slot: u32, g: vec3i) -> bool {
    return cloud_sun_volume_stamps[slot] == cloud_sun_volume_clock.x
        && cloud_sun_volume_word(slot, CLOUD_SUN_VOLUME_R_DRAWN) == 1u
        && bitcast<i32>(cloud_sun_volume_word(slot, CLOUD_SUN_VOLUME_R_X)) == g.x
        && bitcast<i32>(cloud_sun_volume_word(slot, CLOUD_SUN_VOLUME_R_Z)) == g.z
        && cloud_sun_volume_word(slot, CLOUD_SUN_VOLUME_R_SIGNATURE) == clouds.sunVolumeGrid.w;
}

/** O ângulo (rad) entre duas direções unitárias pela corda (`sunVolumeAngle`). */
fn cloud_sun_volume_angle(a: vec3f, b: vec3f) -> f32 {
    return 2.0 * asin(clamp(0.5 * length(a - b), 0.0, 1.0));
}

/** O que mudou desde o desenho guardado em `slot`: o ângulo do sol (rad), a deriva do detalhe (m) e a idade (s). */
fn cloud_sun_volume_moved(slot: u32) -> vec3f {
    let sun = vec3f(
        cloud_sun_volume_word_f(slot, CLOUD_SUN_VOLUME_R_SUN),
        cloud_sun_volume_word_f(slot, CLOUD_SUN_VOLUME_R_SUN + 1u),
        cloud_sun_volume_word_f(slot, CLOUD_SUN_VOLUME_R_SUN + 2u),
    );
    let age = max(clouds.coverageMap.w - cloud_sun_volume_word_f(slot, CLOUD_SUN_VOLUME_R_TIME), 0.0);
    // A deriva do detalhe para cima a 0,1·|vento| (`CloudLayer.windOffsets`): no plano, tudo anda com o referencial.
    return vec3f(cloud_sun_volume_angle(sun, sky.sunDirection.xyz), 0.1 * length(clouds.wind.zw) * age, age);
}

/** O deslocamento (m) de cada parte (o cone, o resto) para o que mudou (`sunVolumeMotion`). */
fn cloud_sun_volume_motion(m: vec3f) -> vec2f {
    return vec2f(clouds.sunVolume.y, CLOUD_SUN_VOLUME_REST_ARM) * m.x + m.y;
}

/** A mudança estimada de τ de cada parte desde o desenho (`sunVolumeChange`). */
fn cloud_sun_volume_change(slot: u32) -> vec2f {
    let m = cloud_sun_volume_moved(slot);
    var c = vec2f(
        cloud_sun_volume_word_f(slot, CLOUD_SUN_VOLUME_R_RATE),
        cloud_sun_volume_word_f(slot, CLOUD_SUN_VOLUME_R_REST_RATE),
    ) * cloud_sun_volume_motion(m);
    if (clouds.sunVolume.w > 0.0) {
        c += vec2f(
            cloud_sun_volume_word_f(slot, CLOUD_SUN_VOLUME_R_TAU),
            cloud_sun_volume_word_f(slot, CLOUD_SUN_VOLUME_R_REST_TAU),
        ) * (m.z / clouds.sunVolume.w);
    }
    return c;
}

/**
 * A fila da página (`sunVolumeKey`): 24…31 sem desenho que valha (os níveis finos e as perto antes), 1…23 pela mudança
 * (em tolerâncias do nível), 0 nada.
 */
fn cloud_sun_volume_key(current: bool, change: f32, tolerance: f32, level: u32, distance: i32) -> u32 {
    if (!current) { return 31u - min(2u * level + u32(distance / 5), 7u); }
    if (change < tolerance) { return 0u; }
    return u32(clamp(1.0 + floor(2.0 * log2(change / tolerance)), 1.0, 23.0));
}

@compute @workgroup_size(CLOUD_SUN_VOLUME_KEYS_GROUP)
fn cloud_sun_volume_keys_main(@builtin(global_invocation_id) gid: vec3u) {
    let word = gid.x;
    if (word >= CLOUD_SUN_VOLUME_VALID_WORDS) { return; }
    let on = cloud_sun_volume_on();
    var valid = vec2u(0u);
    var keys: array<u32, 8>;
    for (var j = 0u; j < CLOUD_SUN_VOLUME_KEYS_CHUNK; j++) {
        let slot = word * CLOUD_SUN_VOLUME_KEYS_CHUNK + j;
        if (!on || slot >= CLOUD_SUN_VOLUME_PAGE_COUNT) { continue; }
        let k = cloud_sun_volume_slot_level(slot);
        let g = cloud_sun_volume_global(k, cloud_sun_volume_slot_page(slot));
        let current = cloud_sun_volume_current(slot, g);
        let scale = f32(1u << k);
        var change = vec2f(0.0);
        var rest_worth = false;
        if (current) {
            change = cloud_sun_volume_change(slot);
            if (change.x < CLOUD_SUN_VOLUME_INVALID * scale) { valid.x |= 1u << j; }
            if (change.y < CLOUD_SUN_VOLUME_INVALID * scale) { valid.y |= 1u << j; }
            // O ritmo da mudança do resto desde o desenho: o redesenho dele só vale se durar a vida mínima.
            let age = max(cloud_sun_volume_moved(slot).z, 1.0 / 60.0);
            rest_worth = change.y / age * CLOUD_SUN_VOLUME_REST_LIFE < CLOUD_SUN_VOLUME_INVALID * scale;
        }
        let cam = cloud_sun_volume_camera(k);
        let d = max(abs(g.x - cam.x), abs(g.z - cam.y));
        let c = max(change.x, select(0.0, change.y, rest_worth));
        let key = cloud_sun_volume_key(current, c, CLOUD_SUN_VOLUME_TOLERANCE * scale, k, d);
        keys[j / 4u] |= key << (8u * (j % 4u));
        if (key > 0u) { atomicAdd(&cloud_sun_volume_work[CLOUD_SUN_VOLUME_WORK_HIST + key], 1u); }
    }
    // As filas das 32 páginas: as oito palavras desta invocação.
    for (var w = 0u; w < 8u; w++) {
        atomicStore(&cloud_sun_volume_work[CLOUD_SUN_VOLUME_WORK_KEYS + word * 8u + w], keys[w]);
    }
    atomicStore(&cloud_sun_volume_work[CLOUD_SUN_VOLUME_WORK_VALID + word], valid.x);
    atomicStore(&cloud_sun_volume_work[CLOUD_SUN_VOLUME_WORK_VALID + CLOUD_SUN_VOLUME_VALID_WORDS + word], valid.y);
}

var<workgroup> cloud_sun_volume_wg_cut: vec2u;

@compute @workgroup_size(CLOUD_SUN_VOLUME_SELECT_GROUP)
fn cloud_sun_volume_select_main(@builtin(local_invocation_index) lid: u32) {
    if (lid == 0u) {
        var left = min(clouds.sunVolumeGrid.z, CLOUD_SUN_VOLUME_LIST);
        var cut = vec2u(32u, 0u);
        for (var b = 31u; b >= 1u; b--) {
            let c = atomicLoad(&cloud_sun_volume_work[CLOUD_SUN_VOLUME_WORK_HIST + b]);
            if (left > 0u) {
                cut = vec2u(b, min(c, left));
                left -= cut.y;
            }
        }
        cloud_sun_volume_wg_cut = cut;
    }
    let cut = workgroupUniformLoad(&cloud_sun_volume_wg_cut);
    // As filas do quadro lidas: o histograma volta a zero para o quadro seguinte (as filas o somam por atômicos).
    if (lid < 32u) { atomicStore(&cloud_sun_volume_work[CLOUD_SUN_VOLUME_WORK_HIST + lid], 0u); }
    // Na fila do corte, pela ordem da página (a soma de prefixos no grupo).
    let first = lid * CLOUD_SUN_VOLUME_SELECT_CHUNK;
    var at_cut = 0u;
    for (var j = 0u; j < CLOUD_SUN_VOLUME_SELECT_CHUNK; j++) {
        let slot = first + j;
        if (slot >= CLOUD_SUN_VOLUME_PAGE_COUNT) { break; }
        let key = (atomicLoad(&cloud_sun_volume_work[CLOUD_SUN_VOLUME_WORK_KEYS + slot / 4u]) >> (8u * (slot % 4u))) & 255u;
        at_cut += select(0u, 1u, key == cut.x);
    }
    var rank = pa_exclusive(lid, at_cut);
    var count = 0u;
    var chosen = vec2u(0u);
    for (var j = 0u; j < CLOUD_SUN_VOLUME_SELECT_CHUNK; j++) {
        let slot = first + j;
        if (slot >= CLOUD_SUN_VOLUME_PAGE_COUNT) { break; }
        let key = (atomicLoad(&cloud_sun_volume_work[CLOUD_SUN_VOLUME_WORK_KEYS + slot / 4u]) >> (8u * (slot % 4u))) & 255u;
        var take = key > cut.x;
        if (key == cut.x) {
            take = key > 0u && rank < cut.y;
            rank++;
        }
        if (take) {
            chosen[j / 32u] |= 1u << (j % 32u);
            count++;
        }
    }
    var at = pa_exclusive(lid, count);
    for (var j = 0u; j < CLOUD_SUN_VOLUME_SELECT_CHUNK; j++) {
        if ((chosen[j / 32u] & (1u << (j % 32u))) == 0u) { continue; }
        atomicStore(&cloud_sun_volume_work[CLOUD_SUN_VOLUME_WORK_LIST + at], first + j);
        at++;
    }
    // A escolhida é desenhada antes da marcha: as duas partes dela valem no quadro (as palavras das marcas desta invocação).
    for (var w = 0u; w < 2u; w++) {
        let word = first / 32u + w;
        if (word >= CLOUD_SUN_VOLUME_VALID_WORDS) { break; }
        atomicOr(&cloud_sun_volume_work[CLOUD_SUN_VOLUME_WORK_VALID + word], chosen[w]);
        atomicOr(&cloud_sun_volume_work[CLOUD_SUN_VOLUME_WORK_VALID + CLOUD_SUN_VOLUME_VALID_WORDS + word], chosen[w]);
    }
    workgroupBarrier();
    if (lid == CLOUD_SUN_VOLUME_SELECT_GROUP - 1u) { atomicStore(&cloud_sun_volume_work[0], at); }
}

// ---- o desenho ----

var<workgroup> cloud_sun_volume_wg_page: vec4u;
/** O deslocamento das duas partes desde o desenho de antes e as taxas dele. */
var<workgroup> cloud_sun_volume_wg_before: vec4f;
var<workgroup> cloud_sun_volume_wg_sums: array<atomic<u32>, 4>;

/** O τ do trecho do cone de `x` para o sol (`sunVolumeValue`). */
fn cloud_sun_volume_value(x: vec3f) -> f32 {
    let sun = sky.sunDirection.xyz;
    let dt = clouds.sunVolume.y / f32(CLOUD_SUN_VOLUME_SAMPLES);
    var rho = 0.0;
    for (var i = 0u; i < CLOUD_SUN_VOLUME_SAMPLES; i++) {
        rho += cloud_density(x + sun * ((f32(i) + 0.5) * dt), true);
    }
    return rho * dt * clouds.layer.z;
}

/** A taxa medida de uma parte (`sunVolumeRate`): |Δτ| médio ÷ o deslocamento, com o piso; sem deslocamento que meça, a de antes. */
fn cloud_sun_volume_rate(delta: f32, motion: f32, before: f32) -> f32 {
    return select(before, max(delta / max(motion, 1e-6), CLOUD_SUN_VOLUME_RATE_FLOOR), motion >= 1.0);
}

@compute @workgroup_size(CLOUD_SUN_VOLUME_DRAW_GROUP)
fn cloud_sun_volume_draw_main(
    @builtin(workgroup_id) wid: vec3u,
    @builtin(local_invocation_index) lid: u32,
) {
    if (lid == 0u) {
        var slot = CLOUD_SUN_VOLUME_PAGE_COUNT;
        if (wid.x < min(atomicLoad(&cloud_sun_volume_work[0]), CLOUD_SUN_VOLUME_LIST)) {
            slot = atomicLoad(&cloud_sun_volume_work[CLOUD_SUN_VOLUME_WORK_LIST + wid.x]);
        }
        var measure = 0u;
        var before = vec4f(0.0);
        if (slot < CLOUD_SUN_VOLUME_PAGE_COUNT) {
            let k = cloud_sun_volume_slot_level(slot);
            // O desenho de antes desta mesma página e conteúdo mede as taxas (o deslocamento desde ele).
            if (cloud_sun_volume_current(slot, cloud_sun_volume_global(k, cloud_sun_volume_slot_page(slot)))) {
                measure = 1u;
                before = vec4f(
                    cloud_sun_volume_motion(cloud_sun_volume_moved(slot)),
                    cloud_sun_volume_word_f(slot, CLOUD_SUN_VOLUME_R_RATE),
                    cloud_sun_volume_word_f(slot, CLOUD_SUN_VOLUME_R_REST_RATE),
                );
            }
        }
        cloud_sun_volume_wg_page = vec4u(slot, measure, 0u, 0u);
        cloud_sun_volume_wg_before = before;
        for (var c = 0u; c < 4u; c++) { atomicStore(&cloud_sun_volume_wg_sums[c], 0u); }
    }
    let page = workgroupUniformLoad(&cloud_sun_volume_wg_page);
    let slot = page.x;
    if (slot >= CLOUD_SUN_VOLUME_PAGE_COUNT) { return; }
    let measure = page.y != 0u;
    let k = cloud_sun_volume_slot_level(slot);
    let phys = cloud_sun_volume_slot_page(slot);
    let g = cloud_sun_volume_global(k, phys);
    let origin = cloud_sun_volume_atlas(k, phys);
    let sun = sky.sunDirection.xyz;
    let S = CLOUD_SUN_VOLUME_STRIDE;
    for (var r = 0u; r < 3u; r++) {
        let j = lid + r * CLOUD_SUN_VOLUME_DRAW_GROUP;
        if (j >= CLOUD_SUN_VOLUME_NODES) { break; }
        let l = vec3u(j % S, (j / S) % S, j / (S * S));
        let x = cloud_sun_volume_node(k, g * i32(CLOUD_SUN_VOLUME_PAGE) + vec3i(l));
        let tau = cloud_sun_volume_value(x);
        let rest = cloud_sun_rest(x + sun * clouds.sunVolume.y, clouds.march.y);
        textureStore(cloud_sun_volume_out, origin + l, vec4f(tau, rest, 0.0, 0.0));
        if (j % CLOUD_SUN_VOLUME_PROBE_STEP == 0u && j / CLOUD_SUN_VOLUME_PROBE_STEP < CLOUD_SUN_VOLUME_PROBES) {
            let w = j / CLOUD_SUN_VOLUME_PROBE_STEP;
            if (measure) {
                let d = abs(vec2f(tau, rest) - vec2f(
                    cloud_sun_volume_word_f(slot, CLOUD_SUN_VOLUME_R_PROBES + w),
                    cloud_sun_volume_word_f(slot, CLOUD_SUN_VOLUME_R_REST_PROBES + w),
                ));
                atomicAdd(&cloud_sun_volume_wg_sums[0], u32(clamp(d.x * CLOUD_SUN_VOLUME_UNIT, 0.0, 1e8)));
                atomicAdd(&cloud_sun_volume_wg_sums[1], u32(clamp(d.y * CLOUD_SUN_VOLUME_UNIT, 0.0, 1e8)));
            }
            atomicAdd(&cloud_sun_volume_wg_sums[2], u32(clamp(tau * CLOUD_SUN_VOLUME_UNIT, 0.0, 1e8)));
            atomicAdd(&cloud_sun_volume_wg_sums[3], u32(clamp(rest * CLOUD_SUN_VOLUME_UNIT, 0.0, 1e8)));
            cloud_sun_volume_set_f(slot, CLOUD_SUN_VOLUME_R_PROBES + w, tau);
            cloud_sun_volume_set_f(slot, CLOUD_SUN_VOLUME_R_REST_PROBES + w, rest);
        }
    }
    workgroupBarrier();
    if (lid != 0u) { return; }
    let before = cloud_sun_volume_wg_before;
    let probes = f32(CLOUD_SUN_VOLUME_PROBES) * CLOUD_SUN_VOLUME_UNIT;
    // As taxas: as medidas entre os dois desenhos (com deslocamento que meça), com o piso; sem medida, as de partida.
    var rate = vec2f(CLOUD_SUN_VOLUME_RATE, CLOUD_SUN_VOLUME_REST_RATE);
    if (measure) {
        rate = vec2f(
            cloud_sun_volume_rate(f32(atomicLoad(&cloud_sun_volume_wg_sums[0])) / probes, before.x, before.z),
            cloud_sun_volume_rate(f32(atomicLoad(&cloud_sun_volume_wg_sums[1])) / probes, before.y, before.w),
        );
    }
    cloud_sun_volume_set(slot, CLOUD_SUN_VOLUME_R_X, bitcast<u32>(g.x));
    cloud_sun_volume_set(slot, CLOUD_SUN_VOLUME_R_Z, bitcast<u32>(g.z));
    cloud_sun_volume_set(slot, CLOUD_SUN_VOLUME_R_SIGNATURE, clouds.sunVolumeGrid.w);
    cloud_sun_volume_set(slot, CLOUD_SUN_VOLUME_R_FRAME, clouds.march.z);
    for (var c = 0u; c < 3u; c++) { cloud_sun_volume_set_f(slot, CLOUD_SUN_VOLUME_R_SUN + c, sun[c]); }
    cloud_sun_volume_set_f(slot, CLOUD_SUN_VOLUME_R_TIME, clouds.coverageMap.w);
    cloud_sun_volume_set_f(slot, CLOUD_SUN_VOLUME_R_RATE, rate.x);
    cloud_sun_volume_set_f(slot, CLOUD_SUN_VOLUME_R_REST_RATE, rate.y);
    cloud_sun_volume_set_f(slot, CLOUD_SUN_VOLUME_R_TAU, f32(atomicLoad(&cloud_sun_volume_wg_sums[2])) / probes);
    cloud_sun_volume_set_f(slot, CLOUD_SUN_VOLUME_R_REST_TAU, f32(atomicLoad(&cloud_sun_volume_wg_sums[3])) / probes);
    cloud_sun_volume_set(slot, CLOUD_SUN_VOLUME_R_DRAWN, 1u);
    cloud_sun_volume_stamps[slot] = cloud_sun_volume_clock.x;
}
