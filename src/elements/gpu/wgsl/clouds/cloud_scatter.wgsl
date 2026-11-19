// Cache de espalhamento das nuvens (spec 041, T023, R8; páginas, R11 revisto): o transporte não local da luz na camada.
// As sondas da grade (`cloud_scatter_grid`) ficam em páginas de 8 × 8 × 8 numa série por páginas de buffer (a soma da luz
// dos caminhos em unidades da iluminância do sol e a contagem, quatro palavras por sonda; antes das páginas, o registro de
// cada uma: o sol e o quadro do último caminho, a geração da grade e quantas sondas têm nuvem). Por quadro:
//   1. `cloud_scatter_select_main` (um grupo): a fila das páginas — a que nunca caminhou nesta geração, e as demais pela
//      idade × a proximidade da câmera × vista pela câmera × com nuvem — e as do orçamento (`clouds.scatterWork.x`); a
//      geração sobe quando a grade recomeça (o corte da câmera, a série que não vale, o centro da grade que muda), e as
//      páginas de outra geração valem zero. Para cada escolhida, o esquecimento pelo ângulo que o sol andou desde o
//      caminho anterior dela (`e^(−Δ/CLOUD_SCATTER_SUN_MEMORY)`; o sol parado não esquece).
//   2. `cloud_scatter_main` (uma sonda por invocação nas páginas escolhidas): se há nuvem na sonda ou numa das seis
//      vizinhas (a forma sem o detalhe), soma um caminho — rastreamento delta (Novák 2018) no meio com o pico de frente
//      truncado (δ-M), o próximo evento ao sol em cada colisão pelo mapa visto do sol, o céu ao sair por cima, o chão (com
//      a sombra das nuvens) ao sair por baixo — que estima a luz que chega à sonda espalhada pela fase na direção da
//      câmera. A média tem janela `clouds.scatterParams.y` caminhos.
//   3. `cloud_scatter_filter_main` (`cloud_scatter_filter.wgsl`): o filtro binomial das sondas cuja vizinhança mudou.
// A marcha soma o espalhamento simples exato e esta luz × σs.
// Teto constante: `CLOUD_SCATTER_STEPS` passos por caminho (nulos, reais e saltos) e `CLOUD_PHASE_TRIES` tentativas em
// cada amostra da fase — o orçamento total por invocação é `CLOUD_SCATTER_STEPS × (1 + 2·CLOUD_PHASE_TRIES)`; a escolha,
// `CLOUD_SCATTER_SELECT_CHUNK` páginas por invocação.
// Requer: WORKGROUP_SIZE, constants, random, xform_rigid, cloud_common, cloud_sun, cloud_density, cloud_phase,
// cloud_shadow_lookup, cloud_scatter_grid, cloud_scatter_pages, sky_query, clouds, cameras, page_alloc,
// cloud_ambient_tex, cloud_scatter_cache, cloud_scatter_work, cloud_scatter_stamps, cloud_scatter_clock.

const CLOUD_SCATTER_STEPS: u32 = 256u;
const CLOUD_SCATTER_COLLISIONS: u32 = 48u;
const CLOUD_PHASE_TRIES: u32 = 8u;
const RANDOM_STREAM_CLOUD_SCATTER: u32 = RANDOM_STREAM_USER + 41u;
/** Ângulo (rad) do sol que reduz a média das sondas a 1/e: 0,25° (o sol que anda depressa cai nas oitavas, sem o ruído de poucos caminhos). */
const CLOUD_SCATTER_SUN_MEMORY: f32 = 0.0043633231;

fn cloud_scatter_rand(state: ptr<function, u32>) -> f32 {
    return random_unit(random_next(state));
}

/** A direção com o cosseno `c` em volta de `w` e o azimute `phi`. */
fn cloud_scatter_rotate(w: vec3f, c: f32, phi: f32) -> vec3f {
    let a = select(vec3f(1.0, 0.0, 0.0), vec3f(0.0, 1.0, 0.0), abs(w.x) > 0.9);
    let t = normalize(cross(a, w));
    let b = cross(w, t);
    let s = sqrt(max(0.0, 1.0 - c * c));
    return normalize(t * (s * cos(phi)) + b * (s * sin(phi)) + w * c);
}

/** Cosseno da fase truncada: a HG pela inversa restrita ao lado de fora do corte; Draine por rejeição (teto constante). */
fn cloud_scatter_sample_cos(state: ptr<function, u32>) -> f32 {
    let cut = clouds.phaseCut;
    let p = clouds.phase;
    if (cloud_scatter_rand(state) < cut.z) {
        let g = p.x;
        let q = cloud_scatter_rand(state) * cut.w * 2.0 * g / (1.0 - g * g) + 1.0 / (1.0 + g);
        return clamp((1.0 + g * g - 1.0 / (q * q)) / (2.0 * g), -1.0, cut.x);
    }
    let g = p.y;
    var mu = 0.0;
    for (var k = 0u; k < CLOUD_PHASE_TRIES; k++) {
        let s = (1.0 - g * g) / (1.0 - g + 2.0 * g * cloud_scatter_rand(state));
        mu = clamp((1.0 + g * g - s * s) / (2.0 * g), -1.0, 1.0);
        let accept = (1.0 + p.z * mu * mu) / (1.0 + p.z);
        if (mu <= cut.x && cloud_scatter_rand(state) < accept) { return mu; }
    }
    return min(mu, cut.x);
}

fn cloud_scatter_direction(d: vec3f, state: ptr<function, u32>) -> vec3f {
    let c = cloud_scatter_sample_cos(state);
    return cloud_scatter_rotate(d, c, 2.0 * PI * cloud_scatter_rand(state));
}

/** A radiância do chão no ponto `pg` (Lambert): o sol com a sombra das nuvens (meio truncado) e o céu. */
fn cloud_scatter_ground(pg: vec3f, k_t: f32) -> vec3f {
    let sun = sky.sunDirection.xyz;
    let t = exp(-cloud_shadow_depth(pg) * k_t);
    let e = sky.sunIlluminance.rgb * sky_sun_transmittance(pg) * max(sun.y, 0.0) * t;
    let up = textureLoad(cloud_ambient_tex, vec2u(0u, 0u), 0).rgb;
    return sky.ground.rgb * (e / PI + up);
}

/** Um caminho da sonda `x0` com a câmera na direção `dcam` (espelho de `scatterWalk`). */
fn cloud_scatter_walk(x0: vec3f, dcam: vec3f, collisions: u32, state: ptr<function, u32>) -> vec3f {
    let cut = clouds.phaseCut;
    let albedo = clouds.layer.w;
    let k_t = 1.0 - albedo * cut.y;
    let albedo_t = albedo * (1.0 - cut.y) / k_t;
    let majorant = clouds.layer.z * k_t * cloud_density_bound();
    let r = clouds.shell.x;
    let top = clouds.shell.z;
    let base = clouds.shell.y;
    let sun = sky.sunDirection.xyz;
    var d = dcam;
    if (cloud_scatter_rand(state) >= cut.y) { d = cloud_scatter_direction(dcam, state); }
    var x = x0;
    var thr = 1.0;
    var light = vec3f(0.0);
    var hits = 0u;
    let n = min(collisions, CLOUD_SCATTER_COLLISIONS);
    for (var s = 0u; s < CLOUD_SCATTER_STEPS; s++) {
        let alt = cloud_altitude(x);
        let up = normalize(vec3f(x.x, x.y + r, x.z));
        let rising = dot(up, d);
        if (alt >= top) {
            if (rising >= 0.0) { return light + thr * sky_radiance(d); }
            let span = cloud_sphere(x, d, r + top);
            if (span.x > span.y) { return light + thr * sky_radiance(d); }
            x = x + d * (span.x + 1e-2);
            continue;
        }
        if (alt <= base) {
            if (rising < 0.0) {
                let g = cloud_sphere(x, d, r);
                if (g.x <= g.y && g.x > 0.0) { return light + thr * cloud_scatter_ground(x + d * g.x, k_t); }
                return light + thr * sky_radiance(d);
            }
            let span = cloud_sphere(x, d, r + base);
            x = x + d * (max(span.y, 0.0) + 1e-2);
            continue;
        }
        x = x + d * (-log(1.0 - cloud_scatter_rand(state)) / majorant);
        let a2 = cloud_altitude(x);
        if (a2 >= top || a2 <= base) { continue; }
        // Colisão nula pela forma sem o detalhe quando ela já fica abaixo do sorteio (o detalhe só reduz).
        let u = cloud_scatter_rand(state) * majorant / (clouds.layer.z * k_t);
        if (cloud_density_above(x, true, u) <= u) { continue; }
        thr *= albedo_t;
        let ph = cloud_phase_truncated(dot(d, sun));
        if (ph > 0.0) {
            let sun_light = sky.sunIlluminance.rgb * cloud_sun_atmosphere(x);
            light += thr * sun_light * exp(-cloud_shadow_depth(x) * k_t) * ph;
        }
        d = cloud_scatter_direction(d, state);
        hits++;
        if (hits >= n) { return light; }
    }
    return light + thr * sky_radiance(d);
}

/** Há nuvem (a forma sem o detalhe) na sonda `g` ou numa das seis vizinhas. */
fn cloud_scatter_active(g: vec3u, size: vec3u) -> bool {
    let gi = vec3i(g);
    let hi = vec3i(size) - 1;
    for (var k = 0; k < 7; k++) {
        let axis = (k - 1) / 2;
        let sign = select(-1, 1, (k & 1) == 0);
        let o = select(vec3i(0), vec3i(i32(axis == 0), i32(axis == 1), i32(axis == 2)) * sign, k > 0);
        let q = clamp(gi + o, vec3i(0), hi);
        if (cloud_density(cloud_scatter_probe(vec3u(q), size), false) > 0.0) { return true; }
    }
    return false;
}

// ---- 1. a escolha ----

/**
 * Peso da distância (m) do centro da página à câmera na fila: metade a `CLOUD_SCATTER_NEAR_WEIGHT` (suave: a nuvem a 10–20
 * km enche o horizonte da tela; com metade a 4 km, as distantes caminhavam 4 × menos e a luz delas ficava na estimativa
 * das oitavas — `far-cloud` 4,8 → 11,1 %).
 */
const CLOUD_SCATTER_NEAR_WEIGHT: f32 = 32000.0;
/** A fila da página que nunca caminhou nesta geração. */
const CLOUD_SCATTER_KEY_FRESH: u32 = 15u;
const CLOUD_SCATTER_SELECT_CHUNK: u32 = 8u;

var<workgroup> cloud_scatter_wg_hist: array<atomic<u32>, 16>;
var<workgroup> cloud_scatter_wg_cut: vec2u;
var<workgroup> cloud_scatter_wg_gen: u32;

/** A caixa (as sondas dos cantos) da página `p` toca o frustum da câmera? */
fn cloud_scatter_visible(p: u32, size: vec3u) -> bool {
    let vp = cameras[clouds.march.w].viewProjection;
    let lo = cloud_scatter_page_origin(p, size);
    let hi = min(lo + vec3u(CLOUD_SCATTER_PAGE - 1u), size - 1u);
    var below = vec3u(0u);
    var above = vec3u(0u);
    for (var c = 0u; c < 8u; c++) {
        let g = select(lo, hi, vec3<bool>((c & 1u) != 0u, (c & 2u) != 0u, (c & 4u) != 0u));
        let clip = vp * vec4f(cloud_scatter_probe(g, size), 1.0);
        below += vec3u(vec3<bool>(clip.x < -clip.w, clip.y < -clip.w, clip.z < 0.0));
        above += vec3u(vec3<bool>(clip.x > clip.w, clip.y > clip.w, clip.z > clip.w));
    }
    return !(any(below == vec3u(8u)) || any(above == vec3u(8u)));
}

/**
 * A fila da página `p` (0: fora; 1…14 pela prioridade em oitavas; 15: nunca caminhou nesta geração): os quadros desde o
 * último caminho × a proximidade da câmera × 2 vista × 1/8 sem nuvem (a que não tem nuvem caminha às vezes, para achar a
 * que o vento traz).
 */
fn cloud_scatter_key(p: u32, size: vec3u, gen: u32) -> u32 {
    if (!cloud_scatter_page_current(p, gen)) { return CLOUD_SCATTER_KEY_FRESH; }
    let age = clouds.scatterWork.z - cloud_scatter_header(p, 3u);
    let g = cloud_scatter_page_origin(p, size) + vec3u(CLOUD_SCATTER_PAGE / 2u);
    let c = cloud_scatter_probe(min(g, size - 1u), size);
    let d = max(abs(c.x - clouds.eye.x), abs(c.z - clouds.eye.z));
    let near = 1.0 / (1.0 + d / CLOUD_SCATTER_NEAR_WEIGHT);
    let cloudy = select(0.125, 1.0, cloud_scatter_header(p, 5u) > 0u);
    let vis = select(1.0, 2.0, cloud_scatter_visible(p, size));
    // A câmera só desempata (√ dos pesos): com o sol andando, a página que caminha menos esquece a média pelo ângulo e
    // cai nas oitavas — as nuvens do contraluz escureciam no `pordosol` com a proximidade e a visibilidade inteiras.
    let pr = f32(max(age, 1u)) * cloudy * sqrt(near * vis);
    if (pr < 1.0) { return select(0u, 1u, age > 0u); }
    return clamp(1u + u32(floor(log2(pr))), 1u, CLOUD_SCATTER_KEY_FRESH - 1u);
}

@compute @workgroup_size(CLOUD_SCATTER_SELECT_GROUP)
fn cloud_scatter_select_main(@builtin(local_invocation_index) lid: u32) {
    let size = clouds_scatter_size();
    let pages = cloud_scatter_page_count(size);
    if (lid < 16u) { atomicStore(&cloud_scatter_wg_hist[lid], 0u); }
    if (lid == 0u) {
        // A geração da grade: sobe quando o histórico não vale (o corte, a série, o centro que mudou).
        var gen = cloud_scatter_global(0u);
        if (!cloud_scatter_history_valid()) { gen++; }
        cloud_scatter_wg_gen = gen;
    }
    let gen = workgroupUniformLoad(&cloud_scatter_wg_gen);
    var keys: array<u32, CLOUD_SCATTER_SELECT_CHUNK>;
    for (var j = 0u; j < CLOUD_SCATTER_SELECT_CHUNK; j++) {
        let p = lid * CLOUD_SCATTER_SELECT_CHUNK + j;
        keys[j] = 0u;
        if (p < pages) { keys[j] = cloud_scatter_key(p, size, gen); }
        if (keys[j] > 0u) { atomicAdd(&cloud_scatter_wg_hist[keys[j]], 1u); }
    }
    workgroupBarrier();
    if (lid == 0u) {
        var left = clouds.scatterWork.x;
        var cut = vec2u(16u, 0u);
        for (var b = CLOUD_SCATTER_KEY_FRESH; b >= 1u; b--) {
            if (left == 0u) { break; }
            let c = atomicLoad(&cloud_scatter_wg_hist[b]);
            cut = vec2u(b, min(c, left));
            left -= cut.y;
        }
        cloud_scatter_wg_cut = cut;
    }
    let cut = workgroupUniformLoad(&cloud_scatter_wg_cut);
    var at_cut = 0u;
    for (var j = 0u; j < CLOUD_SCATTER_SELECT_CHUNK; j++) { at_cut += select(0u, 1u, keys[j] == cut.x); }
    var rank = pa_exclusive(lid, at_cut);
    var chosen: array<bool, CLOUD_SCATTER_SELECT_CHUNK>;
    var count = 0u;
    for (var j = 0u; j < CLOUD_SCATTER_SELECT_CHUNK; j++) {
        chosen[j] = keys[j] > cut.x;
        if (keys[j] == cut.x) {
            chosen[j] = keys[j] > 0u && rank < cut.y;
            rank++;
        }
        count += select(0u, 1u, chosen[j]);
    }
    var at = pa_exclusive(lid, count);
    let sun = sky.sunDirection.xyz;
    let reset = gen != cloud_scatter_global(0u);
    for (var j = 0u; j < CLOUD_SCATTER_SELECT_CHUNK; j++) {
        let p = lid * CLOUD_SCATTER_SELECT_CHUNK + j;
        if (p >= pages) { break; }
        // A marca do filtro: a página que caminha muda; na geração nova, todas (as de outra geração valem zero).
        atomicStore(&cloud_scatter_work[cloud_scatter_work_dirty(p)], select(0u, 1u, chosen[j] || reset));
        if (!chosen[j]) { continue; }
        // O esquecimento pelo ângulo que o sol andou desde o caminho anterior da página (pela corda: `1 − cos` de
        // 0,005–0,03° fica abaixo da resolução do f32); a página de outra geração começa do zero.
        var forget = 0.0;
        if (cloud_scatter_page_current(p, gen)) {
            let last = vec3f(cloud_scatter_header_f(p, 0u), cloud_scatter_header_f(p, 1u), cloud_scatter_header_f(p, 2u));
            forget = exp(-2.0 * asin(clamp(0.5 * length(last - sun), 0.0, 1.0)) / CLOUD_SCATTER_SUN_MEMORY);
        }
        atomicStore(&cloud_scatter_work[CLOUD_SCATTER_WORK_LIST + at * 2u], p);
        atomicStore(&cloud_scatter_work[CLOUD_SCATTER_WORK_LIST + at * 2u + 1u], bitcast<u32>(forget));
        at++;
        cloud_scatter_set_header_f(p, 0u, sun.x);
        cloud_scatter_set_header_f(p, 1u, sun.y);
        cloud_scatter_set_header_f(p, 2u, sun.z);
        cloud_scatter_set_header(p, 3u, clouds.scatterWork.z);
        cloud_scatter_set_header(p, 4u, gen);
        cloud_scatter_set_header(p, 5u, 0u);
        cloud_scatter_stamps[p] = cloud_scatter_clock.x;
    }
    workgroupBarrier();
    if (lid == CLOUD_SCATTER_SELECT_GROUP - 1u) { atomicStore(&cloud_scatter_work[0], at); }
    if (lid == 0u) { cloud_scatter_set_global(0u, gen); }
}

// ---- 2. os caminhos ----

@compute @workgroup_size(WORKGROUP_SIZE)
fn cloud_scatter_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let size = clouds_scatter_size();
    let i = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    let e = i / CLOUD_SCATTER_PAGE_PROBES;
    if (e >= atomicLoad(&cloud_scatter_work[0])) { return; }
    let p = atomicLoad(&cloud_scatter_work[CLOUD_SCATTER_WORK_LIST + e * 2u]);
    let forget = bitcast<f32>(atomicLoad(&cloud_scatter_work[CLOUD_SCATTER_WORK_LIST + e * 2u + 1u]));
    let l = i % CLOUD_SCATTER_PAGE_PROBES;
    let g = cloud_scatter_page_origin(p, size)
        + vec3u(l % CLOUD_SCATTER_PAGE, (l / CLOUD_SCATTER_PAGE) % CLOUD_SCATTER_PAGE, l / (CLOUD_SCATTER_PAGE * CLOUD_SCATTER_PAGE));
    if (any(g >= size)) { return; }
    let w = cloud_scatter_probe_word(p, l);
    var q = cloud_scatter_load(w) * forget;
    if (cloud_scatter_active(g, size)) {
        atomicAdd(&cloud_scatter_cache[cloud_scatter_header_word(p, 5u)], 1u);
        let x = cloud_scatter_probe(g, size);
        let dcam = normalize(x - clouds.eye.xyz);
        let id = g.x + size.x * (g.y + size.y * g.z);
        var state = random_seed(RANDOM_STREAM_CLOUD_SCATTER, id, clouds.scatterWork.z);
        let s = cloud_scatter_walk(x, dcam, clouds.scatterWork.y, &state) / max(sky.sunIlluminance.g, 1e-6);
        // A média com janela: a soma e a contagem escaladas para a contagem não passar do teto.
        let n = q.a + 1.0;
        let keep = min(n, clouds.scatterParams.y) / n;
        q = vec4f((q.rgb + s) * keep, n * keep);
    } else {
        q = vec4f(0.0);
    }
    cloud_scatter_store(w, q);
}
