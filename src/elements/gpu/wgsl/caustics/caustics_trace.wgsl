// Fótons das cáusticas (spec 034, T067c; antes na GI, spec 033 US5): os fótons saem em grade (a malha de fótons, Shah et
// al. 2007; Schjøth et al. 2007): o passe dos alvos (`caustics_targets_main`, a cada quadro: as instâncias de vidro e
// metal liso pelo próprio material no centro delas, avaliado na onda dos acertos por `caustics_instances_main`, e a caixa
// dos volumes atravessados por raios, a água) reparte os fótons do quadro em segmentos — um por luz direcional e alvo,
// a grade sobre a projeção da caixa dele, e um por luz pontual, a grade de ângulos sólidos iguais — pela potência (na
// caixa dos volumes, só os ladrilhos dela com água no caminho da luz — os fótons ficam onde há água); cada fóton leva a
// vazão da célula dele (dividida pelo número de projeções que cobrem o ponto), a grade deslocada por um sorteio por
// quadro. O fóton segue pelo mesmo
// acerto da refração (`refraction_scene_hit`: a malha ou a superfície de um volume) e o fechamento do grafo nele
// (avaliado na onda dos acertos): numa interface dielétrica reflete ou refrata pelo Fresnel exato entre o meio em que está
// (o ar, ou a água) e o do outro lado — os três canais pelo mesmo caminho; numa interface com dispersão, um passe por
// canal desde a fonte com o mesmo sorteio, o índice de cada um (sem ruído de cor: os três só se separam onde os índices
// diferem); no metal liso reflete com a cor dele; os trechos dentro da água atenuam pelo meio homogêneo do corpo, analítico
// pelo comprimento (a absorção guardada ao entrar pela superfície; spec 039, T110). Na primeira superfície difusa depois de ao menos uma especular deposita a vazão no hash e para — a
// luz direta que não passou por nada especular é a das luzes, e a que atravessa a água chega nelas em linha reta: o
// fóton cuja linha reta cruza a água subtrai essa parcela onde ela chegaria (a variável de controle, com a pegada exata
// da célula). O fóton que chega à difusa guarda o pouso (o ponto, a normal, o último trecho e a assinatura do caminho: as
// instâncias e os lobos); depois dos rebotes, `caustics_splat_main` mede a área da célula dele pelos pousos dos vizinhos
// da grade com a mesma assinatura e deposita a vazão nela (`caustics_splat`), no mínimo o borrão do disco da luz pelo
// último trecho (o sol de 0,27° a 30 cm: 3 mm).
// O meio da atmosfera (`light_transmission`) entra no ponto de onde o fóton sai. A invocação 0 guarda no cabeçalho a potência por fóton do quadro e a contagem do anterior.
// Os rebotes em rodadas pela onda dos acertos (spec 039): a emissão põe os fótons na fila; cada rodada traça os fótons
// vivos em blocos do tamanho da onda (`caustics_photon_hit_main`), avalia o material por classe fora do traçado e segue
// (`caustics_photon_follow_main`), até as rodadas do `CausticsFlow` (`CAUSTICS_BOUNCES`).
// Requer: WORKGROUP_SIZE, NONE, caustics, caustics_common, caustics_hash_atomic, caustics_targets,
// caustics_instance_capable, caustics_photons, caustics_queue, caustics_args_out, caustics_args, CausticsPhoton, bsdf, random, basis,
// sampling, lights, light_transmission, ray_scene, refraction_scene, ray_wave, ray_volume_hit,
// ray_volume_bounds, ray_volume_occupied.

/** Instâncias-alvo dos fótons (no máximo) e luzes com áreas acumuladas. */
const CAUSTICS_TARGETS: u32 = 64u;
const CAUSTICS_TARGET_LIGHTS: u32 = 8u;
// Layout de `caustics_targets` (f32): [0] contagem; [1] o alvo da caixa dos volumes; [8 + 8k ..] a caixa da instância k (lo xyz, 0, hi xyz, 0);
// [8 + 8·64 + 64·l + k] a área acumulada da projeção para a luz l até a instância k.
const CAUSTICS_AREAS: u32 = 520u;
/** Palavra de `caustics_targets` com o alvo da caixa dos volumes (índice + 1; 0 sem volumes). */
const CAUSTICS_VOLUME_TARGET: u32 = 1u;
/**
 * Os segmentos da grade dos fótons em `caustics_targets`: a contagem e, a partir de `CAUSTICS_SEGMENTS`,
 * `CAUSTICS_SEGMENT_WORDS` palavras cada.
 */
const CAUSTICS_SEGMENT_COUNT: u32 = 1032u;
const CAUSTICS_SEGMENTS: u32 = 1040u;
/** Teto de segmentos: as direcionais com mapa de alvos (8 × 64) e 64 pontuais. */
const CAUSTICS_MAX_SEGMENTS: u32 = 576u;
const CAUSTICS_SEGMENT_WORDS: u32 = 12u;
/**
 * Ladrilhos por eixo da caixa dos volumes no plano de cada luz direcional: só os que têm água recebem fótons (testados
 * por `CAUSTICS_TILE_PROBES`² raios) — os respingos esticam a caixa por todo o chão, e a grade sobre a caixa inteira
 * deixava 93 % das células sobre o seco e as poças com células de 16 cm.
 */
const CAUSTICS_VOLUME_TILES: u32 = 16u;
const CAUSTICS_TILE_PROBES: u32 = 3u;
/**
 * O quanto o centro dos alvos pode se afastar da âncora sem que ela mude (m; x, y, z): metade do alcance do nível fino
 * (±1023 células de 5 mm em x e z, ±511 em y).
 */
const CAUSTICS_ANCHOR_REACH: vec3f = vec3f(2.0, 1.0, 2.0);
/** A âncora das células do hash em `caustics_targets` (xyz). */
const CAUSTICS_TARGET_ANCHOR: u32 = 2u;
/** Vagas por fóton principal: ele e os dois canais extras da dispersão (`i + count`, `i + 2·count`). */
const CAUSTICS_PHOTON_SLOTS_PER: u32 = 3u;
/** Taps no máximo por eixo da pegada de um depósito (mais que isso, o nível de cima). */
const CAUSTICS_SPLAT_TAPS: u32 = 8u;
/** Normais de dois pousos vizinhos na mesma superfície (cosseno mínimo). */
const CAUSTICS_SAME_SURFACE: f32 = 0.9;

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
/** Os ladrilhos da caixa dos volumes com água, por luz direcional com mapa de alvos (bit por ladrilho). */
var<workgroup> caustics_wg_tiles: array<atomic<u32>, 64>;

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
    // Os ladrilhos da caixa dos volumes com água, em paralelo (8 luzes × 256 ladrilhos, um bit cada).
    for (var k = lid; k < 64u; k += WORKGROUP_SIZE) { atomicStore(&caustics_wg_tiles[k], 0u); }
    workgroupBarrier();
    let volume = u32(caustics_targets[CAUSTICS_VOLUME_TARGET]);
    if (volume != 0u) {
        let tiles = CAUSTICS_VOLUME_TILES * CAUSTICS_VOLUME_TILES;
        for (var k = lid; k < CAUSTICS_TARGET_LIGHTS * CAUSTICS_VOLUME_TILES * CAUSTICS_VOLUME_TILES;
            k += WORKGROUP_SIZE) {
            let l = k / tiles;
            if (l >= lightCount || lights[l].kind != 0u) { continue; }
            if (caustics_volume_tile_wet(normalize(lights[l].direction.xyz), volume - 1u, k % tiles)) {
                atomicOr(&caustics_wg_tiles[k / 32u], 1u << (k % 32u));
            }
        }
    }
    workgroupBarrier();
    if (lid == 0u) { caustics_segments_build(targets, lightCount); }
}

/** O retângulo (min u, min v, max u, max v) do ladrilho `tile` da projeção `r` da caixa dos volumes. */
fn caustics_tile_rect(r: vec4f, tile: u32) -> vec4f {
    let n = f32(CAUSTICS_VOLUME_TILES);
    let size = (r.zw - r.xy) / n;
    let lo = r.xy + vec2f(f32(tile % CAUSTICS_VOLUME_TILES), f32(tile / CAUSTICS_VOLUME_TILES)) * size;
    return vec4f(lo, lo + size);
}

/** O ladrilho `tile` da caixa dos volumes (o alvo `aim`) tem água no caminho da luz de direção `d`? */
fn caustics_volume_tile_wet(d: vec3f, aim: u32, tile: u32) -> bool {
    let box = caustics_target_box(aim);
    let r = caustics_footprint(d, box[0], box[1]);
    let t = caustics_tile_rect(r, tile);
    let b = caustics_basis(d);
    let back = length(box[1] - box[0]) + 1.0;
    let depth = dot(0.5 * (box[0] + box[1]), d) - back;
    for (var j = 0u; j < CAUSTICS_TILE_PROBES; j++) {
        for (var i = 0u; i < CAUSTICS_TILE_PROBES; i++) {
            let f = (vec2f(f32(i), f32(j)) + 0.5) / f32(CAUSTICS_TILE_PROBES);
            let uv = mix(t.xy, t.zw, f);
            if (ray_volume_occupied(b[0] * uv.x + b[1] * uv.y + d * depth, d, 2.0 * back)) { return true; }
        }
    }
    return false;
}

/** O ladrilho `tile` da luz `light` tem água (o passe dos alvos)? */
fn caustics_tile_wet(light: u32, tile: u32) -> bool {
    let k = light * CAUSTICS_VOLUME_TILES * CAUSTICS_VOLUME_TILES + tile;
    return (atomicLoad(&caustics_wg_tiles[k / 32u]) & (1u << (k % 32u))) != 0u;
}

/**
 * A âncora das células (o centro dos alvos em passos de meio metro, com histerese) e os segmentos da grade dos fótons do quadro: por luz
 * direcional e alvo (a projeção da caixa) e por luz pontual (a esfera de direções), os fótons pelo peso — a potência; na
 * caixa dos volumes, um segmento por ladrilho com água (`caustics_volume_tile_wet`) —, a grade W × H com as
 * proporções da projeção e a vazão de cada célula como fração da potência por fóton do quadro.
 */
fn caustics_segments_build(targets: u32, directional_lights: u32) {
    var lo = vec3f(1e30);
    var hi = vec3f(-1e30);
    for (var j = 0u; j < targets; j++) {
        let box = caustics_target_box(j);
        lo = min(lo, box[0]);
        hi = max(hi, box[1]);
    }
    // A âncora fica onde estava enquanto o centro dos alvos não se afasta dela mais que `CAUSTICS_ANCHOR_REACH`: a caixa
    // da água cresce e encolhe com os respingos, e outra âncora recomeça o hash — a luz que chega pela água some por
    // quadros e a sombra junto às paredes pisca.
    let held = bitcast<vec3f>(vec3u(atomicLoad(&caustics_hash_atomic[CAUSTICS_ANCHOR]),
        atomicLoad(&caustics_hash_atomic[CAUSTICS_ANCHOR + 1u]), atomicLoad(&caustics_hash_atomic[CAUSTICS_ANCHOR + 2u])));
    let center = select(held, 0.5 * (lo + hi), targets > 0u);
    var anchor = held;
    if (any(abs(center - held) > CAUSTICS_ANCHOR_REACH)) { anchor = floor(center * 2.0 + 0.5) * 0.5; }
    caustics_targets[CAUSTICS_TARGET_ANCHOR] = anchor.x;
    caustics_targets[CAUSTICS_TARGET_ANCHOR + 1u] = anchor.y;
    caustics_targets[CAUSTICS_TARGET_ANCHOR + 2u] = anchor.z;
    let count = caustics_photon_count();
    let lightCount = min(min(caustics.counts.x, arrayLength(&lights)), LIGHT_LIMIT);
    var total = 0.0;
    for (var l = 0u; l < lightCount; l++) { total += caustics_power(l); }
    let per_photon = total / max(f32(count), 1.0);
    let volume = u32(caustics_targets[CAUSTICS_VOLUME_TARGET]);
    let tiles = CAUSTICS_VOLUME_TILES * CAUSTICS_VOLUME_TILES;
    // Os pesos (duas passadas: a soma e os segmentos): a potência na área de cada alvo; na caixa dos volumes, só os
    // ladrilhos com água.
    var weights = 0.0;
    for (var l = 0u; l < lightCount; l++) {
        let e = caustics_light_irradiance(l);
        if (e <= 0.0) { continue; }
        if (lights[l].kind != 0u) {
            weights += e * 4.0 * PI;
            continue;
        }
        if (l >= directional_lights) { continue; }
        let d = normalize(lights[l].direction.xyz);
        for (var j = 0u; j < targets; j++) {
            let r = caustics_target_rect(d, j);
            if (j + 1u != volume) {
                weights += e * caustics_rect_area(r);
                continue;
            }
            for (var k = 0u; k < CAUSTICS_VOLUME_TILES * CAUSTICS_VOLUME_TILES; k++) {
                if (caustics_tile_wet(l, k)) { weights += e * caustics_rect_area(caustics_tile_rect(r, k)); }
            }
        }
    }
    var n = 0u;
    var start = 0u;
    for (var l = 0u; l < lightCount; l++) {
        let e = caustics_light_irradiance(l);
        if (e <= 0.0 || weights <= 0.0) { continue; }
        if (lights[l].kind != 0u) {
            if (n >= CAUSTICS_MAX_SEGMENTS) { break; }
            let photons = u32(floor(f32(count) * e * 4.0 * PI / weights));
            let w = max(1u, u32(round(sqrt(f32(photons) * 0.5))));
            let h = photons / w;
            if (h == 0u) { continue; }
            caustics_segment_put(n, start, w, h, l, NONE, e * 4.0 * PI / f32(w * h) / per_photon, vec2f(0.0), vec2f(0.0));
            start += photons;
            n++;
            continue;
        }
        if (l >= directional_lights) { continue; }
        let d = normalize(lights[l].direction.xyz);
        for (var j = 0u; j < targets; j++) {
            let r = caustics_target_rect(d, j);
            let pieces = select(1u, tiles, j + 1u == volume);
            for (var k = 0u; k < CAUSTICS_VOLUME_TILES * CAUSTICS_VOLUME_TILES; k++) {
                if (k >= pieces || n >= CAUSTICS_MAX_SEGMENTS) { break; }
                var rect = r;
                if (pieces > 1u) {
                    if (!caustics_tile_wet(l, k)) { continue; }
                    rect = caustics_tile_rect(r, k);
                }
                let photons = u32(floor(f32(count) * e * caustics_rect_area(rect) / weights));
                let size = max(rect.zw - rect.xy, vec2f(1e-6));
                let w = max(1u, u32(round(sqrt(f32(photons) * size.x / size.y))));
                let h = photons / w;
                if (h == 0u) { continue; }
                let cell = size / vec2f(f32(w), f32(h));
                caustics_segment_put(n, start, w, h, l, j, e * cell.x * cell.y / per_photon, cell, rect.xy);
                start += photons;
                n++;
            }
        }
    }
    caustics_targets[CAUSTICS_SEGMENT_COUNT] = f32(n);
}

/** A projeção da caixa do alvo `j` no plano perpendicular a `d`. */
fn caustics_target_rect(d: vec3f, j: u32) -> vec4f {
    let box = caustics_target_box(j);
    return caustics_footprint(d, box[0], box[1]);
}

fn caustics_rect_area(r: vec4f) -> f32 {
    return max((r.z - r.x) * (r.w - r.y), 0.0);
}

/** A irradiância (direcional) ou intensidade (pontual) da luz `i` no canal mais forte. */
fn caustics_light_irradiance(i: u32) -> f32 {
    let light = lights[i];
    return light.intensity * max(max(light.color.r, light.color.g), light.color.b);
}

/**
 * Grava o segmento `k`: o primeiro fóton, a grade, a luz, o alvo, a vazão por célula, o tamanho da célula e o canto
 * (u, v) da grade no plano da luz.
 */
fn caustics_segment_put(k: u32, start: u32, w: u32, h: u32, light: u32, aim: u32, flux: f32, cell: vec2f,
    corner: vec2f) {
    let at = CAUSTICS_SEGMENTS + CAUSTICS_SEGMENT_WORDS * k;
    caustics_targets[at] = bitcast<f32>(start);
    caustics_targets[at + 1u] = bitcast<f32>(w);
    caustics_targets[at + 2u] = bitcast<f32>(h);
    caustics_targets[at + 3u] = bitcast<f32>(light);
    caustics_targets[at + 4u] = bitcast<f32>(aim);
    caustics_targets[at + 5u] = flux;
    caustics_targets[at + 6u] = cell.x;
    caustics_targets[at + 7u] = cell.y;
    caustics_targets[at + 8u] = corner.x;
    caustics_targets[at + 9u] = corner.y;
}

/** Um segmento da grade dos fótons. */
struct CausticsSegment {
    start: u32,
    w: u32,
    h: u32,
    light: u32,
    aim: u32,
    flux: f32,
    cell: vec2f,
    corner: vec2f,
}

fn caustics_segment(k: u32) -> CausticsSegment {
    let at = CAUSTICS_SEGMENTS + CAUSTICS_SEGMENT_WORDS * k;
    return CausticsSegment(bitcast<u32>(caustics_targets[at]), bitcast<u32>(caustics_targets[at + 1u]),
        bitcast<u32>(caustics_targets[at + 2u]), bitcast<u32>(caustics_targets[at + 3u]),
        bitcast<u32>(caustics_targets[at + 4u]), caustics_targets[at + 5u],
        vec2f(caustics_targets[at + 6u], caustics_targets[at + 7u]),
        vec2f(caustics_targets[at + 8u], caustics_targets[at + 9u]));
}

/** O segmento do fóton principal `g` (o último que começa nele ou antes; busca binária), ou `NONE`. */
fn caustics_segment_of(g: u32) -> u32 {
    let n = u32(caustics_targets[CAUSTICS_SEGMENT_COUNT]);
    if (n == 0u) { return NONE; }
    var lo = 0u;
    var hi = n - 1u;
    // log2(576) < 10 passos.
    for (var k = 0u; k < 10u && lo < hi; k++) {
        let mid = (lo + hi + 1u) / 2u;
        if (bitcast<u32>(caustics_targets[CAUSTICS_SEGMENTS + CAUSTICS_SEGMENT_WORDS * mid]) <= g) {
            lo = mid;
        } else {
            hi = mid - 1u;
        }
    }
    let seg = caustics_segment(lo);
    if (g < seg.start || g >= seg.start + seg.w * seg.h) { return NONE; }
    return lo;
}

/** A âncora das células do hash (a do quadro, do passe dos alvos). */
fn caustics_target_anchor() -> vec3f {
    return vec3f(caustics_targets[CAUSTICS_TARGET_ANCHOR], caustics_targets[CAUSTICS_TARGET_ANCHOR + 1u],
        caustics_targets[CAUSTICS_TARGET_ANCHOR + 2u]);
}

/**
 * Deposita a vazão `rgb` (frações da potência por fóton, com sinal) no ponto `q` (a partir da âncora) de normal `n`,
 * pela tenda 2D no plano tangente, no nível `level` — ou no primeiro acima em que a célula cabe na chave.
 */
fn caustics_deposit(q: vec3f, n: vec3f, rgb: vec3f, level: u32) {
    for (var l = level; l < CAUSTICS_LEVELS; l++) {
        let t = caustics_tent(q, n, l);
        if (caustics_key(t.base) == CAUSTICS_EMPTY) { continue; }
        for (var k = 0u; k < 4u; k++) {
            let w = caustics_tent_weight(t, k);
            // A vazão por área da superfície (a da célula é a projetada no plano das camadas).
            caustics_deposit_cell(caustics_tent_cell(t, k), l, rgb * (w * t.cosine));
        }
        return;
    }
}

/**
 * Deposita a vazão `rgb` na pegada do fóton no ponto `p` de normal `n`: o paralelogramo dos lados `e1` e `e2` (levados
 * ao plano tangente) centrado nele, cada lado no mínimo `blur`. Em retângulo de mesma área (o lado maior e a altura sobre
 * ele), no nível em que a célula cobre o lado menor, em até `CAUSTICS_SPLAT_TAPS` taps por eixo (mais que isso, o nível de
 * cima): a vazão repartida pelos taps, cada um pela tenda — a irradiância é a vazão pela área da pegada.
 */
fn caustics_splat(p: vec3f, n: vec3f, e1in: vec3f, e2in: vec3f, rgb: vec3f, blur: f32) {
    var e1 = e1in - n * dot(e1in, n);
    var e2 = e2in - n * dot(e2in, n);
    if (dot(e2, e2) > dot(e1, e1)) {
        let t = e1;
        e1 = e2;
        e2 = t;
    }
    let a = length(e1);
    let fallback = caustics_basis(n);
    let t1 = select(fallback[0], e1 / a, a > 1e-9);
    let e2p = e2 - t1 * dot(e2, t1);
    let b = length(e2p);
    let t2 = select(normalize(cross(n, t1)), e2p / b, b > 1e-9);
    let la = max(a, blur);
    let lb = max(b, blur);
    let cell0 = caustics_cell_size(0u);
    var level = u32(clamp(ceil(log2(max(lb / cell0, 1.0))), 0.0, f32(CAUSTICS_LEVELS - 1u)));
    for (var k = 0u; k < CAUSTICS_LEVELS && level + 1u < CAUSTICS_LEVELS
        && la > f32(CAUSTICS_SPLAT_TAPS) * caustics_cell_size(level); k++) {
        level++;
    }
    let cell = caustics_cell_size(level);
    let nu = u32(clamp(ceil(la / cell), 1.0, f32(CAUSTICS_SPLAT_TAPS)));
    let nv = u32(clamp(ceil(lb / cell), 1.0, f32(CAUSTICS_SPLAT_TAPS)));
    let share = rgb / f32(nu * nv);
    let q = p - caustics_target_anchor();
    for (var i = 0u; i < CAUSTICS_SPLAT_TAPS; i++) {
        if (i >= nu) { break; }
        for (var j = 0u; j < CAUSTICS_SPLAT_TAPS; j++) {
            if (j >= nv) { break; }
            let o = t1 * (la * ((f32(i) + 0.5) / f32(nu) - 0.5)) + t2 * (lb * ((f32(j) + 0.5) / f32(nv) - 0.5));
            caustics_deposit(q + o, n, share, level);
        }
    }
}

/** Soma `rgb` na célula `c` do nível `level`. */
fn caustics_deposit_cell(c: vec3i, level: u32, rgb: vec3f) {
    let key = caustics_key(c);
    if (key == CAUSTICS_EMPTY || all(rgb == vec3f(0.0))) { return; }
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
            return;
        }
        slot = caustics_probe_next(slot, level);
    }
}

// A fila dos fótons vivos (spec 039): `caustics_queue` (atômicos) — [0] a lista corrente (0 ou 1), [1] e [2] as contagens
// das duas listas, [3] o início do bloco corrente; as listas (os índices dos fótons) a partir de `CAUSTICS_QUEUE_LISTS`,
// cada uma com `caustics_photon_slots()` entradas.
const CAUSTICS_QUEUE_LISTS: u32 = 8u;

/** Fótons que a fila comporta: os das invocações e, para a dispersão, dois a mais por invocação (vagas fixas). */
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

/** Um fóton novo na fonte: a posição, a direção, a vazão e o estado do sorteio, nos três canais, sem pouso. */
fn caustics_photon_start(slot: u32, seed: u32, o: vec3f, d: vec3f, rgb: vec3f) {
    var ph: CausticsPhoton;
    ph.origin = o;
    ph.medium = 1.0;
    ph.dir = d;
    ph.side = -1;
    ph.throughput = rgb;
    ph.channel = 3u;
    ph.absorption = vec3f(0.0);
    ph.glass = 0u;
    ph.state = seed;
    ph.specular = 0u;
    ph.sig = 0u;
    ph.travel = 0.0;
    ph.landed = 0u;
    caustics_photons[slot] = ph;
    caustics_queue_push(0u, slot);
}

/**
 * A correção da luz direta que atravessa a água (a variável de controle) para a célula da luz `light` em (o, d) com a
 * vazão `light_rgb`: onde a linha reta chega, se cruzou um volume, a vazão sai com sinal negativo na pegada exata da
 * célula — os lados `pu` + `du`·t e `pv` + `dv`·t no plano perpendicular ao raio (a posição e a direção da célula, na
 * distância t), levados à superfície ao longo do raio. O meio da atmosfera (`light_transmission`) no ponto de chegada.
 */
fn caustics_straight(light: u32, o: vec3f, d: vec3f, light_rgb: vec3f, pu: vec3f, pv: vec3f, du: vec3f, dv: vec3f) {
    let straight = ray_scene_hit(o, d, 1e6);
    if (straight.instance == NONE || straight.face < 0.0) { return; }
    // A reta cruzou a água: o acerto exato da superfície dela no caminho (`ray_volume_hit`, a marcha do traçado) — o mapa
    // da luz no ponto de chegada é grosso e interpolado: perto da água (o topo do cubo, a borda do tanque, o chão junto a
    // uma gota) ele dizia "água" para retas que não a cruzam, e a retirada ficava sem a reposição. A retirada leva a luz
    // que o desenho dá ali em linha reta (`light_transmission`, pelo mapa).
    if (!ray_volume_hit(o, d, straight.t, -1).hit) { return; }
    let n = straight.normal;
    let along = d / select(dot(d, n), -1e-6, abs(dot(d, n)) < 1e-6);
    let e1 = pu + du * straight.t;
    let e2 = pv + dv * straight.t;
    caustics_splat(straight.position, n, e1 - along * dot(e1, n), e2 - along * dot(e2, n),
        -light_rgb * light_transmission(light, straight.position), 0.0);
}

/** A direção da célula (u, v) ∈ [0, 1]² da grade de uma luz pontual: ângulos sólidos iguais (z e φ uniformes). */
fn caustics_point_dir(uv: vec2f) -> vec3f {
    return sample_sphere(vec2f(clamp(uv.x, 0.0, 1.0), uv.y));
}

/** O deslocamento da grade do segmento `seg` no quadro (o mesmo para todos os fótons dele: a vizinhança fica). */
fn caustics_grid_jitter(seg: u32) -> vec2f {
    let h = pcg_hash((caustics.counts.w * 0x9E3779B9u) ^ (seg * 0x85EBCA6Bu + 0x2545F491u));
    return vec2f(f32(h & 0xFFFFu), f32(h >> 16u)) / 65536.0;
}

/**
 * Uma invocação por fóton principal: o segmento da grade dele, a célula (deslocada pelo sorteio do quadro), a vazão da
 * célula, a correção da linha reta e o fóton na fila; sem célula, sem fóton (e sem pouso nos canais da dispersão). Na
 * caixa dos volumes, a célula que só ela cobre e que não passa por nenhuma água (`ray_volume_occupied`) não segue — iria
 * direto a uma difusa, sem nada especular — e conta na fração aceita. A invocação 0 guarda no cabeçalho do hash a
 * potência por fóton do quadro, a contagem do anterior e a âncora (outra âncora: o hash recomeça).
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
        let anchor = bitcast<vec3u>(caustics_target_anchor());
        var moved = false;
        for (var k = 0u; k < 3u; k++) {
            moved = moved || atomicLoad(&caustics_hash_atomic[CAUSTICS_ANCHOR + k]) != anchor[k];
            atomicStore(&caustics_hash_atomic[CAUSTICS_ANCHOR + k], anchor[k]);
        }
        // Com outra âncora as células antigas mudaram de lugar: tudo recomeça (`caustics_resolve_main`).
        if (moved) { atomicStore(&caustics_hash_atomic[1], caustics_slots()); }
    }
    if (i >= count) { return; }
    // Sem pouso até prova em contrário (os canais da dispersão vão às vagas `i + count` e `i + 2·count`).
    for (var k = 0u; k < CAUSTICS_PHOTON_SLOTS_PER; k++) {
        if (i + k * count < caustics_photon_slots()) { caustics_photons[i + k * count].landed = 0u; }
    }
    if (total <= 0.0 || ray_scene_info.instanceCount == 0u) { return; }
    let segment = caustics_segment_of(i);
    if (segment == NONE) { return; }
    let seg = caustics_segment(segment);
    let local = i - seg.start;
    let cell = vec2f(f32(local % seg.w), f32(local / seg.w)) + caustics_grid_jitter(segment);
    let src = lights[seg.light];
    let color = src.color.rgb / max(max(src.color.r, src.color.g), max(src.color.b, 1e-6));
    let seed = random_seed(RANDOM_STREAM_CAUSTICS, i, caustics.counts.w);
    if (src.kind != 0u) {
        let size = vec2f(f32(seg.w), f32(seg.h));
        let uv = cell / size;
        let d = caustics_point_dir(uv);
        let o = src.position.xyz;
        let rgb = color * seg.flux;
        caustics_straight(seg.light, o, d, rgb, vec3f(0.0), vec3f(0.0),
            caustics_point_dir(uv + vec2f(1.0 / size.x, 0.0)) - d, caustics_point_dir(uv + vec2f(0.0, 1.0 / size.y)) - d);
        caustics_photon_start(i, seed, o, d, rgb * light_transmission(seg.light, o));
        return;
    }
    // Direcional: a célula na projeção da caixa do alvo, recuada para fora; a vazão dividida pelas projeções que cobrem o
    // ponto (onde elas se sobrepõem, os fótons vêm de mais de uma).
    let d = normalize(src.direction.xyz);
    let b = caustics_basis(d);
    let targets = u32(caustics_targets[0]);
    let box = caustics_target_box(seg.aim);
    let back = length(box[1] - box[0]) + 1.0;
    let uv = seg.corner + cell * seg.cell;
    var cover = 0.0;
    for (var j = 0u; j < targets; j++) {
        let bj = caustics_target_box(j);
        let rj = caustics_footprint(d, bj[0], bj[1]);
        if (all(uv >= rj.xy) && all(uv <= rj.zw)) { cover += 1.0; }
    }
    let o = b[0] * uv.x + b[1] * uv.y + d * (dot(0.5 * (box[0] + box[1]), d) - back);
    let volume = seg.aim + 1u == u32(caustics_targets[CAUSTICS_VOLUME_TARGET]);
    if (volume && cover <= 1.0 && !ray_volume_occupied(o, d, 2.0 * back)) { return; }
    let rgb = color * seg.flux / max(cover, 1.0);
    caustics_straight(seg.light, o, d, rgb, b[0] * seg.cell.x, b[1] * seg.cell.y, vec3f(0.0), vec3f(0.0));
    caustics_photon_start(i, seed, o, d, rgb * light_transmission(seg.light, o));
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
    // O trecho dentro da água (fora de um vidro mergulhado) atenua pelo meio homogêneo do corpo, analítico pelo
    // comprimento (T110): o fóton entrou pela superfície e guardou a absorção do fechamento dela — sem marcha.
    if (ph.glass == 0u) { caustics_photons[slot].throughput = ph.throughput * exp(-ph.absorption * hit.t); }
    caustics_photons[slot].travel = ph.travel + hit.t;
    // A instância na carga: a assinatura do caminho (`caustics_photon_step`).
    refraction_wave_put(j, hit, caustics.extra.y,
        vec4f(hit.face, select(0.0, 1.0, refraction_is_volume(hit.instance)), bitcast<f32>(hit.instance), 1.0));
}

/** O acerto dos fótons do bloco — os grupos do despacho percorrem os do bloco em passo de grade. */
@compute @workgroup_size(WORKGROUP_SIZE)
fn caustics_photon_hit_main(@builtin(global_invocation_id) gid: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let n = caustics_args[3];
    for (var j = gid.x; j < n; j += nwg.x * WORKGROUP_SIZE) { caustics_photon_hit_one(j); }
}

/**
 * A normal com que o fóton de direção `d` cruza a interface de face `nf` (a geométrica, do lado de onde ele chega): a do
 * fechamento `c` (a ondulação do material da água, o relevo do vidro — a mesma superfície que a câmera vê pela refração),
 * do lado de `nf`; sem ela, ou se ela deixasse o fóton do lado errado (rente à superfície), a geométrica.
 */
fn caustics_shading_normal(c: Closure, nf: vec3f, d: vec3f) -> vec3f {
    if (dot(c.normal, c.normal) <= 1e-12) { return nf; }
    let ns = normalize(c.normal) * select(1.0, -1.0, dot(c.normal, nf) < 0.0);
    return select(nf, ns, dot(d, ns) < 0.0);
}

/**
 * Segue o fóton `ph` na interface do acerto (o ponto `p`, a normal `n`, o lado `outside`, se é volume) com o fechamento
 * `c` dele: numa interface dielétrica reflete ou refrata pelo Fresnel exato entre o meio em que está (o ar, ou a água) e o
 * do outro lado; no metal liso reflete com a cor dele; na difusa guarda o pouso se chegou por um caminho especular (a
 * direta sem nada especular é a das luzes) e para. Cada interface e o lobo dela, e a instância do pouso, entram na
 * assinatura do caminho (`sig`, da instância `inst`): os vizinhos da grade que a repetem formam a pegada dele. Devolve o
 * fóton seguido (`CAUSTICS_STOPPED` no canal: parou).
 */
fn caustics_photon_step(ph0: CausticsPhoton, c: Closure, p: vec3f, n: vec3f, outside: bool, volume: bool, ior: f32,
    u: f32, inst: u32) -> CausticsPhoton {
    var ph = ph0;
    let ns = caustics_shading_normal(c, select(-n, n, outside), ph.dir);
    if (c.transmission_weight > 0.5 && c.transmission_roughness < CAUSTICS_ROUGH) {
        // Os dois lados: o volume (a água) faz fronteira com o ar; a malha, com o meio em que o fóton está.
        let around = select(ph.medium, 1.0, volume);
        let n1 = select(ior, around, outside);
        let n2 = select(around, ior, outside);
        let nn = ns;
        let cosi = clamp(-dot(ph.dir, nn), 0.0, 1.0);
        let t = refract(ph.dir, nn, n1 / n2);
        let reflects = dot(t, t) < 1e-8 || u < bsdf_f_dielectric(cosi, n2 / n1);
        ph.sig = pcg_hash(ph.sig ^ (inst * 2u + select(0u, 1u, reflects)));
        if (reflects) {
            ph.dir = reflect(ph.dir, nn);
            ph.origin = p + nn * 1e-4;
            ph.side = select(-1, select(1, 0, outside), volume);
        } else {
            ph.dir = normalize(t);
            ph.origin = p - nn * 1e-4;
            // O vidro absorve pela cor da transmissão ao sair; a água, pelos trechos (a absorção do meio homogêneo do
            // corpo, guardada ao entrar pela superfície e zerada ao sair).
            if (!outside && !volume) { ph.throughput *= c.transmission_color; }
            if (!volume) { ph.glass = select(0u, 1u, outside); }
            if (volume) {
                ph.medium = select(1.0, ior, outside);
                ph.absorption = select(vec3f(0.0), closure_absorption(c), outside);
            }
            ph.side = select(-1, select(0, 1, outside), volume);
        }
        ph.specular++;
        return ph;
    }
    if (c.conductor_weight > 0.5 && c.specular_roughness < CAUSTICS_ROUGH) {
        let nn = ns;
        let cosi = clamp(-dot(ph.dir, nn), 0.0, 1.0);
        let x = 1.0 - cosi;
        ph.throughput *= c.conductor_f0 + (vec3f(1.0) - c.conductor_f0) * x * x * x * x * x;
        ph.sig = pcg_hash(ph.sig ^ (inst * 2u + 1u));
        ph.dir = reflect(ph.dir, nn);
        ph.origin = p + nn * 1e-4;
        ph.side = -1;
        ph.specular++;
        return ph;
    }
    if (ph.specular > 0u && outside) {
        ph.landed = 1u;
        ph.land = p;
        ph.land_n = n;
        // O último trecho: da interface de onde o fóton saiu ao pouso (o borrão do disco da luz cresce com ele).
        ph.land_t = distance(p, ph.origin);
        ph.sig = pcg_hash(ph.sig ^ inst ^ 0x5bd1e995u);
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
 * canal 0 fica no fóton e os outros dois nas vagas fixas dele (`slot + k·count`: os canais dos vizinhos da grade ficam
 * vizinhos).
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
    let inst = bitcast<u32>(e.hit.payload.z);
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
            let moved = caustics_photon_step(channel, c, e.hit.position, e.hit.normal, outside, volume, iors[k], u,
                inst);
            let at = slot + k * caustics_photon_count();
            if (at >= caustics_photon_slots()) { continue; }
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
    let moved = caustics_photon_step(ph, c, e.hit.position, e.hit.normal, outside, volume, ior, u, inst);
    caustics_photons[slot] = moved;
    if (moved.channel != CAUSTICS_STOPPED) { caustics_queue_push(next, slot); }
}

/** A continuação dos fótons do bloco — os grupos do despacho percorrem os do bloco em passo de grade. */
@compute @workgroup_size(WORKGROUP_SIZE)
fn caustics_photon_follow_main(@builtin(global_invocation_id) gid: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let n = caustics_args[3];
    for (var j = gid.x; j < n; j += nwg.x * WORKGROUP_SIZE) { caustics_photon_follow_one(j); }
}

/**
 * O pouso do fóton da vaga `slot` (na camada `layer` da grade: o principal ou um canal da dispersão) que serve de vizinho
 * ao pouso `ph`: o mesmo caminho (a assinatura) na mesma superfície. w = 0 sem ele.
 */
fn caustics_neighbor(slot: u32, ph: CausticsPhoton) -> vec4f {
    if (slot >= caustics_photon_slots()) { return vec4f(0.0); }
    let o = caustics_photons[slot];
    if (o.landed == 0u || o.sig != ph.sig || dot(o.land_n, ph.land_n) < CAUSTICS_SAME_SURFACE) { return vec4f(0.0); }
    return vec4f(o.land, 1.0);
}

/**
 * O lado da pegada de `ph` num eixo da grade, pelos pousos dos vizinhos `prev` e `next` (a diferença central, ou a de um
 * lado); w = 0 sem nenhum.
 */
fn caustics_side(ph: CausticsPhoton, prev: vec4f, next: vec4f) -> vec4f {
    if (prev.w > 0.0 && next.w > 0.0) { return vec4f(0.5 * (next.xyz - prev.xyz), 1.0); }
    if (next.w > 0.0) { return vec4f(next.xyz - ph.land, 1.0); }
    if (prev.w > 0.0) { return vec4f(ph.land - prev.xyz, 1.0); }
    return vec4f(0.0);
}

/**
 * O depósito de cada fóton que pousou (uma invocação por vaga): a pegada pelos pousos dos vizinhos da grade (a área em
 * que a célula dele chegou — a luz que a água ou o vidro concentram, numa pegada menor); o eixo sem vizinho de mesmo
 * caminho (o lobo raro da roleta de Fresnel, a borda da grade) leva o espaçamento da célula na fonte, o dobro. No mínimo
 * o borrão do disco da luz: o diâmetro angular dele pelo último trecho.
 */
@compute @workgroup_size(WORKGROUP_SIZE)
fn caustics_splat_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let slot = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    let count = caustics_photon_count();
    if (slot >= min(caustics_photon_slots(), count * CAUSTICS_PHOTON_SLOTS_PER) || count == 0u) { return; }
    let ph = caustics_photons[slot];
    if (ph.landed == 0u) { return; }
    let g = slot % count;
    let layer = slot - g;
    let segment = caustics_segment_of(g);
    if (segment == NONE) { return; }
    let seg = caustics_segment(segment);
    let local = g - seg.start;
    let x = local % seg.w;
    let y = local / seg.w;
    let point = lights[seg.light].kind != 0u;
    let at = layer + seg.start;
    var left = vec4f(0.0);
    var right = vec4f(0.0);
    var down = vec4f(0.0);
    var up = vec4f(0.0);
    if (x > 0u) { left = caustics_neighbor(at + y * seg.w + x - 1u, ph); }
    if (x + 1u < seg.w) { right = caustics_neighbor(at + y * seg.w + x + 1u, ph); }
    // Na luz pontual, φ dá a volta.
    if (y > 0u || point) { down = caustics_neighbor(at + ((y + seg.h - 1u) % seg.h) * seg.w + x, ph); }
    if (y + 1u < seg.h || point) { up = caustics_neighbor(at + ((y + 1u) % seg.h) * seg.w + x, ph); }
    var e1 = caustics_side(ph, left, right);
    var e2 = caustics_side(ph, down, up);
    // O espaçamento da célula na fonte, levado ao pouso (na pontual, o ângulo dela pelo caminho todo), o dobro.
    let spacing = select(sqrt(seg.cell.x * seg.cell.y), sqrt(4.0 * PI / f32(seg.w * seg.h)) * ph.travel, point);
    let t = caustics_basis(ph.land_n);
    if (e1.w == 0.0 && e2.w == 0.0) {
        e1 = vec4f(t[0] * 2.0 * spacing, 1.0);
        e2 = vec4f(t[1] * 2.0 * spacing, 1.0);
    } else if (e1.w == 0.0) {
        e1 = vec4f(normalize(cross(ph.land_n, e2.xyz + t[0] * 1e-9)) * 2.0 * spacing, 1.0);
    } else if (e2.w == 0.0) {
        e2 = vec4f(normalize(cross(ph.land_n, e1.xyz + t[0] * 1e-9)) * 2.0 * spacing, 1.0);
    }
    let blur = 2.0 * lights[seg.light].cones.z * ph.land_t;
    caustics_splat(ph.land, ph.land_n, e1.xyz, e2.xyz, ph.throughput, blur);
}
