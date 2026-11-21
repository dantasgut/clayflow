// Cache de espalhamento das nuvens (spec 041, T023, R8; páginas, R11 revisto; T074): o transporte não local da luz na
// camada. As sondas da grade (`cloud_scatter_grid`, no referencial das nuvens) ficam em páginas de 8 × 8 × 8 numa série por
// páginas de buffer (`cloud_scatter_pages`: por sonda, a soma da parte do sol da luz dos caminhos por unidade da luz do
// sol que chega à sonda, a contagem e a soma da parte do céu por unidade da irradiância do céu — a cor e o brilho do sol
// baixo, que mudam depressa com o ângulo, entram na leitura com o sol de agora; antes das páginas, o registro de cada
// uma). Por quadro:
//   1. `cloud_scatter_select_main` (um grupo): a fila das páginas — a que nunca caminhou nesta geração, a que mudou (o
//      sol e a câmera pelas memórias medidas, o vento que sobra além do referencial das nuvens, a evolução, o conteúdo) e a
//      que não encheu a janela — e as do quadro: as de encher (e as novas) até `clouds.scatterWork.x`, as da mudança até
//      `clouds.scatterSize.w`; a geração sobe quando a grade recomeça (o corte da câmera, a série que não vale) e, quando
//      só o centro da grade mudou, a grade de antes é levada à de agora (o transporte, no passe dos caminhos). O panorama a
//      refazer pela mudança medida nas provas do quadro anterior.
//   2. `cloud_scatter_main` (uma sonda por invocação nas páginas escolhidas): se há nuvem na sonda ou numa das seis
//      vizinhas (a forma sem o detalhe), soma um caminho — rastreamento delta (Novák 2018) no meio com o pico de frente
//      truncado (δ-M), o próximo evento ao sol em cada colisão pelo mapa visto do sol, o céu ao sair por cima, o chão (com
//      a sombra das nuvens) ao sair por baixo — que estima a luz que chega à sonda espalhada pela fase na direção da
//      câmera, as duas partes. A média tem janela `clouds.scatterParams.y` caminhos. No quadro do transporte, cada sonda
//      da grade de agora lê a filtrada de antes no seu ponto (`cloud_scatter_carry`).
//   3. `cloud_scatter_filter_main` (`cloud_scatter_filter.wgsl`): o filtro binomial das sondas cuja vizinhança mudou.
// A marcha soma o espalhamento simples exato e esta luz × σs.
// Teto constante: `CLOUD_SCATTER_STEPS` passos por caminho (nulos, reais e saltos) e `CLOUD_PHASE_TRIES` tentativas em
// cada amostra da fase — o orçamento total por invocação é `CLOUD_SCATTER_STEPS × (1 + 2·CLOUD_PHASE_TRIES)`; a escolha,
// `CLOUD_SCATTER_SELECT_CHUNK` páginas por invocação; o transporte, `CLOUD_SCATTER_CARRY_ROUNDS` sondas por invocação.
// Requer: WORKGROUP_SIZE, constants, random, xform_rigid, cloud_common, cloud_sun, cloud_density, cloud_phase,
// cloud_shadow_lookup, cloud_scatter_grid, cloud_scatter_pages, cloud_scatter_lookup, sky_query, clouds, cameras,
// page_alloc, cloud_ambient_tex, cloud_scatter_cache, cloud_scatter_work, cloud_scatter_stamps, cloud_scatter_clock,
// cloud_scatter_filtered_tex, cloud_clamp_sampler, cloud_panorama_tex, cloud_panorama_stamps, cloud_panorama_clock.

const CLOUD_SCATTER_STEPS: u32 = 256u;
const CLOUD_SCATTER_COLLISIONS: u32 = 48u;
const CLOUD_PHASE_TRIES: u32 = 8u;
const RANDOM_STREAM_CLOUD_SCATTER: u32 = RANDOM_STREAM_USER + 41u;

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

/** A luz de um caminho nas duas partes: a do sol (os próximos eventos ao sol, o sol no chão) e a do céu. */
struct CloudScatterLight {
    sun: vec3f,
    sky: vec3f,
}

/** A radiância do chão no ponto `pg` (Lambert) × `thr` somada a `l`: o sol com a sombra das nuvens (meio truncado) e o céu. */
fn cloud_scatter_ground(l: CloudScatterLight, pg: vec3f, k_t: f32, thr: f32) -> CloudScatterLight {
    let sun = sky.sunDirection.xyz;
    let t = exp(-cloud_shadow_depth(pg) * k_t);
    let e = sky.sunIlluminance.rgb * sky_sun_transmittance(pg) * max(sun.y, 0.0) * t;
    let up = textureLoad(cloud_ambient_tex, vec2u(0u, 0u), 0).rgb;
    return CloudScatterLight(l.sun + thr * sky.ground.rgb * e / PI, l.sky + thr * sky.ground.rgb * up);
}

/** `l` com o céu na direção `d` × `thr`. */
fn cloud_scatter_escape(l: CloudScatterLight, d: vec3f, thr: f32) -> CloudScatterLight {
    return CloudScatterLight(l.sun, l.sky + thr * sky_radiance(d));
}

/** Um caminho da sonda `x0` com a câmera na direção `dcam` (espelho de `scatterWalk` com as partes). */
fn cloud_scatter_walk(x0: vec3f, dcam: vec3f, collisions: u32, state: ptr<function, u32>) -> CloudScatterLight {
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
    var light = CloudScatterLight(vec3f(0.0), vec3f(0.0));
    var hits = 0u;
    let n = min(collisions, CLOUD_SCATTER_COLLISIONS);
    for (var s = 0u; s < CLOUD_SCATTER_STEPS; s++) {
        let alt = cloud_altitude(x);
        let up = normalize(vec3f(x.x, x.y + r, x.z));
        let rising = dot(up, d);
        if (alt >= top) {
            if (rising >= 0.0) { return cloud_scatter_escape(light, d, thr); }
            let span = cloud_sphere(x, d, r + top);
            if (span.x > span.y) { return cloud_scatter_escape(light, d, thr); }
            x = x + d * (span.x + 1e-2);
            continue;
        }
        if (alt <= base) {
            if (rising < 0.0) {
                let g = cloud_sphere(x, d, r);
                if (g.x <= g.y && g.x > 0.0) { return cloud_scatter_ground(light, x + d * g.x, k_t, thr); }
                return cloud_scatter_escape(light, d, thr);
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
            light.sun += thr * sun_light * exp(-cloud_shadow_depth(x) * k_t) * ph;
        }
        d = cloud_scatter_direction(d, state);
        hits++;
        if (hits >= n) { return light; }
    }
    return cloud_scatter_escape(light, d, thr);
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
const CLOUD_SCATTER_KEY_FRESH: u32 = 31u;
/** Filas da escolha (a 0, de fora, e as 1…31) de cada orçamento: as de encher a janela e as da mudança, depois delas. */
const CLOUD_SCATTER_KEYS: u32 = 32u;
/** A marca da fila da página que caminha pela mudança (o orçamento `clouds.scatterSize.w`). */
const CLOUD_SCATTER_KEY_MOTION: u32 = 32u;
const CLOUD_SCATTER_SELECT_CHUNK: u32 = 8u;
/**
 * A mudança abaixo da qual a página conta como parada (`CLOUD_SCATTER_STILL` da referência): os ângulos refeitos em f32 em
 * dois lugares do kernel saem ~10⁻⁸ rad diferentes (a mudança ~10⁻⁶) com o sol e a câmera parados.
 */
const CLOUD_SCATTER_STILL: f32 = 1e-4;
/** Tolerância da mudança medida do panorama (`CLOUD_PANORAMA_TOLERANCE` da referência). */
const CLOUD_PANORAMA_TOLERANCE: f32 = 0.02;

var<workgroup> cloud_scatter_wg_hist: array<atomic<u32>, 64>;
/** O corte de cada orçamento: a fila e quantas dela (as de encher em xy, as da mudança em zw). */
var<workgroup> cloud_scatter_wg_cut: vec4u;
var<workgroup> cloud_scatter_wg_gen: u32;
/** O quadro leva a grade de antes à de agora (só o centro mudou). */
var<workgroup> cloud_scatter_wg_carry: u32;
var<workgroup> cloud_scatter_wg_lum: atomic<u32>;
var<workgroup> cloud_scatter_wg_change: atomic<u32>;
var<workgroup> cloud_scatter_wg_trans: atomic<u32>;

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

/** O espaçamento (m) das sondas no plano no centro da página `p` (o menor dos dois eixos). */
fn cloud_scatter_page_spacing(p: u32, size: vec3u) -> f32 {
    let g = cloud_scatter_page_origin(p, size) + vec3u(CLOUD_SCATTER_PAGE / 2u);
    return cloud_scatter_spacing_at(cloud_scatter_probe(min(g, size - 1u), size).xz, clouds.scatterGrid.xy, size);
}

/** O ângulo (rad) entre duas direções unitárias pela corda (o `acos` do f32 dá 0 abaixo de ~0,03°). */
fn cloud_scatter_angle(a: vec3f, b: vec3f) -> f32 {
    return 2.0 * asin(clamp(0.5 * length(a - b), 0.0, 1.0));
}

/** O registro (página ou panorama) a partir da palavra `w0` do cache: o que o último caminho (desenho) viu. */
struct CloudScatterSeen {
    sun: vec3f,
    eye: vec3f,
    time: f32,
    signature: u32,
}

fn cloud_scatter_word_f(w: u32) -> f32 {
    return bitcast<f32>(atomicLoad(&cloud_scatter_cache[w]));
}

fn cloud_scatter_word_v3(w: u32) -> vec3f {
    return vec3f(cloud_scatter_word_f(w), cloud_scatter_word_f(w + 1u), cloud_scatter_word_f(w + 2u));
}

fn cloud_scatter_seen(w0: u32) -> CloudScatterSeen {
    return CloudScatterSeen(
        cloud_scatter_word_v3(w0 + CLOUD_SCATTER_H_SUN),
        cloud_scatter_word_v3(w0 + CLOUD_SCATTER_H_EYE),
        cloud_scatter_word_f(w0 + CLOUD_SCATTER_H_TIME),
        atomicLoad(&cloud_scatter_cache[w0 + CLOUD_SCATTER_H_SIGNATURE]),
    );
}

/** Grava no registro a partir da palavra `w0` o que o quadro vê (o sol, a câmera, o tempo, a assinatura). */
fn cloud_scatter_see(w0: u32) {
    let sun = sky.sunDirection.xyz;
    for (var c = 0u; c < 3u; c++) {
        atomicStore(&cloud_scatter_cache[w0 + CLOUD_SCATTER_H_SUN + c], bitcast<u32>(sun[c]));
        atomicStore(&cloud_scatter_cache[w0 + CLOUD_SCATTER_H_EYE + c], bitcast<u32>(clouds.eye[c]));
    }
    atomicStore(&cloud_scatter_cache[w0 + CLOUD_SCATTER_H_TIME], bitcast<u32>(clouds.coverageMap.w));
    atomicStore(&cloud_scatter_cache[w0 + CLOUD_SCATTER_H_SIGNATURE], clouds.scatterWork.w);
}

/**
 * O esquecimento da média das sondas desde o registro `seen` no ponto `at` (espelho de `scatterForget`):
 * `e^(−(Δθ_sol/M_sol + Δθ_câmera/M_câmera))`, as memórias pela sensibilidade medida da luz guardada (`clouds.scatterMemory.xy`).
 */
fn cloud_scatter_forget(seen: CloudScatterSeen, at: vec3f) -> f32 {
    let sun = cloud_scatter_angle(seen.sun, sky.sunDirection.xyz);
    let view = cloud_scatter_angle(normalize(at - seen.eye), normalize(at - clouds.eye.xyz));
    let m = clouds.scatterMemory;
    return exp(-(sun / m.x + view / m.y));
}

/**
 * A mudança do que um registro guarda desde o último caminho (espelho de `scatterChange`), em frações da média das sondas
 * (0: nada mudou; 1: tudo): o esquecimento pelo sol e pela câmera, o vento que sobra além do referencial das nuvens (a
 * bigorna, `clouds.sunMap.w`, pelo espaçamento `spacing` das sondas), a evolução da forma e da cobertura (o tempo pelo
 * `clouds.sunMap.z`, o tempo em que ela muda a transmitância de 1/e; 0 sem evolução) e o conteúdo (a assinatura dos
 * valores da camada e do céu: outra, tudo). A maior delas. O vento das nuvens não entra: a grade anda com elas.
 */
fn cloud_scatter_change(seen: CloudScatterSeen, at: vec3f, spacing: f32) -> f32 {
    var c = 1.0 - cloud_scatter_forget(seen, at);
    let dt = max(clouds.coverageMap.w - seen.time, 0.0);
    c = max(c, clouds.sunMap.w * dt / spacing);
    if (clouds.sunMap.z > 0.0) { c = max(c, dt / clouds.sunMap.z); }
    if (seen.signature != clouds.scatterWork.w) { c = 1.0; }
    return min(c, 1.0);
}

/**
 * A fila da página `p` (0: nada a fazer; 1…30 pela prioridade em oitavas; 31: nunca caminhou nesta geração; espelho de
 * `scatterPageKey`), com `CLOUD_SCATTER_KEY_MOTION` somado quando o que a página guarda mudou desde o último caminho (o
 * orçamento da mudança; `scatterPageMotion`). A página precisa de caminhos quando o que ela guarda mudou desde o último
 * (`cloud_scatter_change`) ou, com nuvem, quando a média ainda não encheu a janela (os caminhos efetivos abaixo de
 * `clouds.scatterParams.y`) — de pelo menos um caminho da janela (1/janela). A prioridade: a mudança em caminhos da
 * janela × os quadros desde o último (a página que espera sobe: nenhuma fica para sempre fora do teto) × 1/8 sem nuvem
 * × √(proximidade × 2 vista).
 */
fn cloud_scatter_key(p: u32, size: vec3u, gen: u32) -> u32 {
    if (!cloud_scatter_page_current(p, gen)) { return CLOUD_SCATTER_KEY_FRESH; }
    let window = clouds.scatterParams.y;
    let cloudy = cloud_scatter_header(p, CLOUD_SCATTER_H_CLOUDY) > 0u;
    let g = cloud_scatter_page_origin(p, size) + vec3u(CLOUD_SCATTER_PAGE / 2u);
    let c = cloud_scatter_probe(min(g, size - 1u), size);
    let moved = cloud_scatter_change(
        cloud_scatter_seen(cloud_scatter_header_word(p, 0u)),
        c,
        cloud_scatter_page_spacing(p, size),
    );
    var change = moved;
    if (cloudy) { change = max(change, 1.0 - cloud_scatter_header_f(p, CLOUD_SCATTER_H_PATHS) / window); }
    if (change * window < 1.0) { return 0u; }
    // A falta da página que mudou desde o último caminho é da mudança (o regime com o sol andando: a média esquece entre
    // dois caminhos), e ela caminha no orçamento da mudança; a parada que não encheu, no de encher.
    let motion = select(0u, CLOUD_SCATTER_KEY_MOTION, moved > CLOUD_SCATTER_STILL);
    let age = clouds.scatterWork.z - cloud_scatter_header(p, CLOUD_SCATTER_H_FRAME);
    let d = max(abs(c.x - clouds.eye.x), abs(c.z - clouds.eye.z));
    let near = 1.0 / (1.0 + d / CLOUD_SCATTER_NEAR_WEIGHT);
    let vis = select(1.0, 2.0, cloud_scatter_visible(p, size));
    // A câmera só desempata (√ dos pesos): com o sol andando, a página que caminha menos esquece a média pelo ângulo e
    // cai nas oitavas — as nuvens do contraluz escureciam no `pordosol` com a proximidade e a visibilidade inteiras.
    let pr = change * window * f32(max(age, 1u)) * select(0.125, 1.0, cloudy) * sqrt(near * vis);
    if (pr < 1.0) { return motion + 1u; }
    return motion + clamp(1u + u32(floor(log2(pr))), 1u, CLOUD_SCATTER_KEY_FRESH - 1u);
}

/**
 * A mudança medida do panorama (espelho de `scatterPanoramaChange`): as provas que o panorama gravou no quadro anterior
 * (texels refeitos como o desenho os faria então) contra os mesmos texels do desenho guardado (`cloud_panorama_tex`) — a
 * maior entre a diferença da luz relativa à luz das provas (`Σ|ΔL| / ΣL`) e a diferença média da transmitância. A
 * média, não a maior: com o sol andando, as páginas do cache que caminham mudam cada texel pelo ruído de poucos caminhos,
 * e o que o panorama dá — a luz do céu tapado lida pelas sondas, pela refração, pelo reflexo — é a soma de muitos texels.
 * As provas no grupo da escolha (uma por invocação); o resultado em todas, depois da barreira.
 */
fn cloud_scatter_panorama_change(lid: u32) -> f32 {
    let count = min(cloud_scatter_global(CLOUD_SCATTER_G_PROBE_COUNT), CLOUD_SCATTER_PANORAMA_PROBES);
    let size = textureDimensions(cloud_panorama_tex);
    if (lid < count) {
        let w = CLOUD_SCATTER_G_PROBES + lid * 3u;
        let t = cloud_scatter_global(w) % (size.x * size.y);
        let drawn = textureLoad(cloud_panorama_tex, vec2u(t % size.x, t / size.x), 0);
        let probe = vec2f(cloud_scatter_word_f(w + 1u), cloud_scatter_word_f(w + 2u));
        // As somas em unidades fixas (a luz pela iluminância do sol em 2⁻¹⁶; a transmitância em 2⁻¹⁶): atômicas inteiras.
        let unit = 65536.0 / max(sky.sunIlluminance.g, 1e-20);
        atomicAdd(&cloud_scatter_wg_lum, u32(clamp(max(probe.x, 0.0) * unit, 0.0, 1e6)));
        atomicAdd(&cloud_scatter_wg_change, u32(clamp(abs(probe.x - max(luminance(drawn.rgb), 0.0)) * unit, 0.0, 1e6)));
        atomicAdd(&cloud_scatter_wg_trans, u32(clamp(abs(probe.y - drawn.a) * 65536.0, 0.0, 1e6)));
    }
    workgroupBarrier();
    if (count == 0u) { return 0.0; }
    let light = f32(atomicLoad(&cloud_scatter_wg_change)) / max(f32(atomicLoad(&cloud_scatter_wg_lum)), 1.0);
    let trans = f32(atomicLoad(&cloud_scatter_wg_trans)) / (65536.0 * f32(count));
    return max(light, trans);
}

/**
 * O quadro continua a grade de antes (a série vale, sem corte de câmera): então a geração só sobe quando o centro muda, e
 * o transporte leva a grade de antes à de agora.
 */
fn cloud_scatter_continues() -> bool {
    let cam = cameras[clouds.march.w];
    return clouds.scatterParams.z > 0.5 && cam.history.x < 0.5;
}

/** O centro da grade no referencial das nuvens com que o cache foi feito é o de agora (`clouds.scatterMemory.zw`)? */
fn cloud_scatter_same_center() -> bool {
    let c = vec2f(cloud_scatter_word_f(CLOUD_SCATTER_G_CENTER), cloud_scatter_word_f(CLOUD_SCATTER_G_CENTER + 1u));
    return all(c == clouds.scatterMemory.zw);
}

@compute @workgroup_size(CLOUD_SCATTER_SELECT_GROUP)
fn cloud_scatter_select_main(@builtin(local_invocation_index) lid: u32) {
    let size = clouds_scatter_size();
    let pages = cloud_scatter_page_count(size);
    if (lid < 2u * CLOUD_SCATTER_KEYS) { atomicStore(&cloud_scatter_wg_hist[lid], 0u); }
    if (lid == 0u) {
        // A geração da grade: sobe quando o histórico não vale (o corte, a série) ou o centro mudou; só o centro, o quadro
        // leva a grade de antes (com páginas da geração de agora) à de agora.
        // O transporte só com a grade de antes valendo (a página 0, a primeira das novas a caminhar, na geração dela).
        let gen0 = cloud_scatter_global(CLOUD_SCATTER_G_GEN);
        let continues = cloud_scatter_continues();
        let same = cloud_scatter_same_center();
        var gen = gen0;
        if (!continues || !same) { gen++; }
        cloud_scatter_wg_gen = gen;
        cloud_scatter_wg_carry = select(0u, 1u, continues && !same && cloud_scatter_page_current(0u, gen0));
        atomicStore(&cloud_scatter_wg_lum, 0u);
        atomicStore(&cloud_scatter_wg_change, 0u);
        atomicStore(&cloud_scatter_wg_trans, 0u);
    }
    let gen = workgroupUniformLoad(&cloud_scatter_wg_gen);
    let carry = workgroupUniformLoad(&cloud_scatter_wg_carry) != 0u;
    // A mudança medida do panorama (antes de as provas serem trocadas pelas deste quadro, no passe dele).
    let panorama = cloud_scatter_panorama_change(lid);
    var keys: array<u32, CLOUD_SCATTER_SELECT_CHUNK>;
    for (var j = 0u; j < CLOUD_SCATTER_SELECT_CHUNK; j++) {
        let p = lid * CLOUD_SCATTER_SELECT_CHUNK + j;
        keys[j] = 0u;
        // No quadro do transporte, nenhuma página caminha: todas são levadas.
        if (p < pages && !carry) { keys[j] = cloud_scatter_key(p, size, gen); }
        if (keys[j] > 0u) { atomicAdd(&cloud_scatter_wg_hist[keys[j]], 1u); }
    }
    workgroupBarrier();
    if (lid == 0u) {
        // As de encher a janela (e as novas) até o orçamento; as da mudança até o orçamento delas, no que sobra.
        var left = clouds.scatterWork.x;
        var cut = vec4u(CLOUD_SCATTER_KEYS, 0u, 2u * CLOUD_SCATTER_KEYS, 0u);
        for (var b = CLOUD_SCATTER_KEY_FRESH; b >= 1u; b--) {
            if (left == 0u) { break; }
            let c = atomicLoad(&cloud_scatter_wg_hist[b]);
            cut = vec4u(b, min(c, left), cut.zw);
            left -= cut.y;
        }
        var moving = min(clouds.scatterSize.w, left);
        for (var b = CLOUD_SCATTER_KEY_FRESH; b >= 1u; b--) {
            if (moving == 0u) { break; }
            let c = atomicLoad(&cloud_scatter_wg_hist[CLOUD_SCATTER_KEY_MOTION + b]);
            cut = vec4u(cut.xy, CLOUD_SCATTER_KEY_MOTION + b, min(c, moving));
            moving -= cut.w;
        }
        cloud_scatter_wg_cut = cut;
    }
    let cut = workgroupUniformLoad(&cloud_scatter_wg_cut);
    // Dentro da fila do corte de cada orçamento, pela ordem da página (a soma de prefixos no grupo).
    var at_fill = 0u;
    var at_move = 0u;
    for (var j = 0u; j < CLOUD_SCATTER_SELECT_CHUNK; j++) {
        at_fill += select(0u, 1u, keys[j] == cut.x);
        at_move += select(0u, 1u, keys[j] == cut.z);
    }
    var rank_fill = pa_exclusive(lid, at_fill);
    var rank_move = pa_exclusive(lid, at_move);
    var chosen: array<bool, CLOUD_SCATTER_SELECT_CHUNK>;
    var count = 0u;
    for (var j = 0u; j < CLOUD_SCATTER_SELECT_CHUNK; j++) {
        let k = keys[j];
        let motion = k > CLOUD_SCATTER_KEY_MOTION;
        chosen[j] = select(k > cut.x, k > cut.z, motion);
        if (k == cut.x && !motion) {
            chosen[j] = k > 0u && rank_fill < cut.y;
            rank_fill++;
        }
        if (k == cut.z && motion) {
            chosen[j] = rank_move < cut.w;
            rank_move++;
        }
        count += select(0u, 1u, chosen[j]);
    }
    var at = pa_exclusive(lid, count);
    let reset = gen != cloud_scatter_global(CLOUD_SCATTER_G_GEN);
    let window = clouds.scatterParams.y;
    for (var j = 0u; j < CLOUD_SCATTER_SELECT_CHUNK; j++) {
        let p = lid * CLOUD_SCATTER_SELECT_CHUNK + j;
        if (p >= pages) { break; }
        // A marca do filtro: a página que caminha muda; na geração nova, todas (as de outra geração valem zero).
        atomicStore(&cloud_scatter_work[cloud_scatter_work_dirty(p)], select(0u, 1u, chosen[j] || reset));
        if (carry) {
            // O transporte: a página passa à geração de agora com o que a sonda de antes guardava no ponto dela (os
            // caminhos efetivos e as com nuvem, pelo passe dos caminhos).
            cloud_scatter_see(cloud_scatter_header_word(p, 0u));
            cloud_scatter_set_header(p, CLOUD_SCATTER_H_FRAME, clouds.scatterWork.z);
            cloud_scatter_set_header(p, CLOUD_SCATTER_H_GEN, gen);
            cloud_scatter_set_header(p, CLOUD_SCATTER_H_CLOUDY, 0u);
            cloud_scatter_set_header_f(p, CLOUD_SCATTER_H_PATHS, window);
            cloud_scatter_stamps[p] = cloud_scatter_clock.x;
            continue;
        }
        if (!chosen[j]) { continue; }
        // O esquecimento pelo ângulo que o sol e a câmera andaram desde o caminho anterior da página (pela corda: `1 − cos`
        // de 0,005–0,03° fica abaixo da resolução do f32); a página de outra geração começa do zero. Os caminhos efetivos
        // da página seguem a média das sondas: esquecidos junto e mais um, até a janela.
        var forget = 0.0;
        var paths = 0.0;
        if (cloud_scatter_page_current(p, gen)) {
            let g = cloud_scatter_page_origin(p, size) + vec3u(CLOUD_SCATTER_PAGE / 2u);
            forget = cloud_scatter_forget(
                cloud_scatter_seen(cloud_scatter_header_word(p, 0u)),
                cloud_scatter_probe(min(g, size - 1u), size),
            );
            paths = cloud_scatter_header_f(p, CLOUD_SCATTER_H_PATHS);
        }
        atomicStore(&cloud_scatter_work[CLOUD_SCATTER_WORK_LIST + at * 2u], p);
        atomicStore(&cloud_scatter_work[CLOUD_SCATTER_WORK_LIST + at * 2u + 1u], bitcast<u32>(forget));
        at++;
        cloud_scatter_see(cloud_scatter_header_word(p, 0u));
        cloud_scatter_set_header(p, CLOUD_SCATTER_H_FRAME, clouds.scatterWork.z);
        cloud_scatter_set_header(p, CLOUD_SCATTER_H_GEN, gen);
        cloud_scatter_set_header(p, CLOUD_SCATTER_H_CLOUDY, 0u);
        cloud_scatter_set_header_f(p, CLOUD_SCATTER_H_PATHS, min(paths * forget + 1.0, window));
        cloud_scatter_stamps[p] = cloud_scatter_clock.x;
    }
    workgroupBarrier();
    if (lid == CLOUD_SCATTER_SELECT_GROUP - 1u) {
        atomicStore(&cloud_scatter_work[0], at);
        atomicStore(&cloud_scatter_work[CLOUD_SCATTER_WORK_ANY], select(0u, 1u, at > 0u || reset));
    }
    if (lid == 0u) {
        // O transporte: o centro de antes no mundo (o do referencial das nuvens mais o deslocamento do vento de agora).
        let before = vec2f(cloud_scatter_word_f(CLOUD_SCATTER_G_CENTER), cloud_scatter_word_f(CLOUD_SCATTER_G_CENTER + 1u));
        let world = before + (clouds.scatterGrid.xy - clouds.scatterMemory.zw);
        atomicStore(&cloud_scatter_work[CLOUD_SCATTER_WORK_CARRY], select(0u, 1u, carry));
        atomicStore(&cloud_scatter_work[CLOUD_SCATTER_WORK_CARRY_CENTER], bitcast<u32>(world.x));
        atomicStore(&cloud_scatter_work[CLOUD_SCATTER_WORK_CARRY_CENTER + 1u], bitcast<u32>(world.y));
        // O panorama do quadro: a série que não vale, outro conteúdo ou a mudança medida nas provas (espelho de
        // `scatterPanoramaRedo`). As páginas que caminham não o refazem.
        let valid = cloud_panorama_stamps[0] == cloud_panorama_clock.x;
        let same = cloud_scatter_seen(CLOUD_SCATTER_G_PANORAMA).signature == clouds.scatterWork.w;
        let redo = !valid || !same || panorama > CLOUD_PANORAMA_TOLERANCE;
        atomicStore(&cloud_scatter_work[CLOUD_SCATTER_WORK_PANORAMA], select(0u, 1u, redo));
        // O registro do quadro (para a medida): a mudança medida e o porquê (1 a série, 2 o conteúdo, 4 a mudança).
        atomicStore(&cloud_scatter_work[CLOUD_SCATTER_WORK_PANORAMA_CHANGE], bitcast<u32>(panorama));
        atomicStore(
            &cloud_scatter_work[CLOUD_SCATTER_WORK_PANORAMA_CHANGE + 1u],
            select(0u, 1u, !valid) | select(0u, 2u, !same) | select(0u, 4u, panorama > CLOUD_PANORAMA_TOLERANCE),
        );
        if (redo) { cloud_scatter_see(CLOUD_SCATTER_G_PANORAMA); }
        cloud_scatter_set_global(CLOUD_SCATTER_G_GEN, gen);
        // As provas lidas: a contagem zera (as do quadro de provas seguinte a refazem).
        cloud_scatter_set_global(CLOUD_SCATTER_G_PROBE_COUNT, 0u);
        atomicStore(&cloud_scatter_cache[CLOUD_SCATTER_G_CENTER], bitcast<u32>(clouds.scatterMemory.z));
        atomicStore(&cloud_scatter_cache[CLOUD_SCATTER_G_CENTER + 1u], bitcast<u32>(clouds.scatterMemory.w));
    }
}

// ---- 2. os caminhos ----

/** Sondas por invocação no quadro do transporte (o despacho dos caminhos cobre `orçamento × 512`; 1600 ÷ 200 = 8 no alto). */
const CLOUD_SCATTER_CARRY_ROUNDS: u32 = 64u;

/** A área (m²) de uma sonda no plano no ponto `xz` da grade de `size` sondas centrada em `center`. */
fn cloud_scatter_cell_area(xz: vec2f, center: vec2f, size: vec3u) -> f32 {
    let gr = clouds.scatterGrid;
    let a = asinh((xz - center) / gr.z) / gr.w;
    let d = gr.z * gr.w * cosh(gr.w * a) * 2.0 / vec2f(f32(size.x), f32(size.z));
    return d.x * d.y;
}

/**
 * O transporte da sonda `g` da página `p` (espelho de `scatterCarryWeight`): a sonda filtrada da grade de antes (centrada
 * em `before`) no ponto da de agora, as somas e a contagem × `min(1, A_agora/A_antes)` (as áreas da sonda no plano); fora
 * da grade de antes, zero. Os caminhos efetivos da página: o menor das sondas dela.
 */
fn cloud_scatter_carry(p: u32, l: u32, g: vec3u, size: vec3u, before: vec2f) {
    let x = cloud_scatter_probe(g, size);
    let a = cloud_scatter_plane_uv(x.xz, before);
    var q = CloudScatterProbe(vec4f(0.0), vec4f(0.0));
    if (all(a >= vec2f(0.0)) && all(a <= vec2f(1.0))) {
        let n = f32(size.y);
        let y = (f32(g.y) + 0.5) / (2.0 * n);
        let qs = textureSampleLevel(cloud_scatter_filtered_tex, cloud_clamp_sampler, vec3f(a.x, y, a.y), 0.0);
        let qk = textureSampleLevel(cloud_scatter_filtered_tex, cloud_clamp_sampler, vec3f(a.x, y + 0.5, a.y), 0.0);
        let k = min(1.0, cloud_scatter_cell_area(x.xz, clouds.scatterGrid.xy, size) / cloud_scatter_cell_area(x.xz, before, size));
        q = CloudScatterProbe(qs * k, vec4f(qk.rgb * k, 0.0));
    }
    cloud_scatter_store(cloud_scatter_probe_word(p, l), q);
    atomicMin(&cloud_scatter_cache[cloud_scatter_header_word(p, CLOUD_SCATTER_H_PATHS)], bitcast<u32>(max(q.sun.a, 0.0)));
    if (q.sun.a > 0.0) { atomicAdd(&cloud_scatter_cache[cloud_scatter_header_word(p, CLOUD_SCATTER_H_CLOUDY)], 1u); }
}

@compute @workgroup_size(WORKGROUP_SIZE)
fn cloud_scatter_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let size = clouds_scatter_size();
    let i = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    if (atomicLoad(&cloud_scatter_work[CLOUD_SCATTER_WORK_CARRY]) != 0u) {
        let before = vec2f(
            bitcast<f32>(atomicLoad(&cloud_scatter_work[CLOUD_SCATTER_WORK_CARRY_CENTER])),
            bitcast<f32>(atomicLoad(&cloud_scatter_work[CLOUD_SCATTER_WORK_CARRY_CENTER + 1u])),
        );
        let total = cloud_scatter_page_count(size) * CLOUD_SCATTER_PAGE_PROBES;
        let stride = nwg.x * nwg.y * WORKGROUP_SIZE;
        for (var r = 0u; r < CLOUD_SCATTER_CARRY_ROUNDS; r++) {
            let j = i + r * stride;
            if (j >= total) { break; }
            let p = j / CLOUD_SCATTER_PAGE_PROBES;
            let l = j % CLOUD_SCATTER_PAGE_PROBES;
            let g = cloud_scatter_page_origin(p, size)
                + vec3u(l % CLOUD_SCATTER_PAGE, (l / CLOUD_SCATTER_PAGE) % CLOUD_SCATTER_PAGE, l / (CLOUD_SCATTER_PAGE * CLOUD_SCATTER_PAGE));
            if (any(g >= size)) { continue; }
            cloud_scatter_carry(p, l, g, size, before);
        }
        return;
    }
    let e = i / CLOUD_SCATTER_PAGE_PROBES;
    if (e >= atomicLoad(&cloud_scatter_work[0])) { return; }
    let p = atomicLoad(&cloud_scatter_work[CLOUD_SCATTER_WORK_LIST + e * 2u]);
    let forget = bitcast<f32>(atomicLoad(&cloud_scatter_work[CLOUD_SCATTER_WORK_LIST + e * 2u + 1u]));
    let l = i % CLOUD_SCATTER_PAGE_PROBES;
    let g = cloud_scatter_page_origin(p, size)
        + vec3u(l % CLOUD_SCATTER_PAGE, (l / CLOUD_SCATTER_PAGE) % CLOUD_SCATTER_PAGE, l / (CLOUD_SCATTER_PAGE * CLOUD_SCATTER_PAGE));
    if (any(g >= size)) { return; }
    let w = cloud_scatter_probe_word(p, l);
    let old = cloud_scatter_load(w);
    var q = CloudScatterProbe(old.sun * forget, old.sky * forget);
    if (cloud_scatter_active(g, size)) {
        atomicAdd(&cloud_scatter_cache[cloud_scatter_header_word(p, CLOUD_SCATTER_H_CLOUDY)], 1u);
        let x = cloud_scatter_probe(g, size);
        let dcam = normalize(x - clouds.eye.xyz);
        let id = g.x + size.x * (g.y + size.y * g.z);
        var state = random_seed(RANDOM_STREAM_CLOUD_SCATTER, id, clouds.scatterWork.z);
        let s = cloud_scatter_walk(x, dcam, clouds.scatterWork.y, &state);
        // As partes guardadas pela luz de cada uma (espelho de `scatterNormalize`): o sol pela iluminância que chega à
        // sonda (a transmitância da atmosfera até ela, com o piso), o céu pela irradiância do céu de cima.
        let e_sun = max(sky.sunIlluminance.rgb, vec3f(1e-20)) * max(cloud_sun_atmosphere(x), vec3f(CLOUD_SCATTER_SUN_FLOOR));
        let ns = s.sun / e_sun;
        let nk = s.sky / cloud_scatter_sky_unit();
        // A média com janela: as somas e a contagem escaladas para a contagem não passar do teto.
        let n = q.sun.a + 1.0;
        let keep = min(n, clouds.scatterParams.y) / n;
        q = CloudScatterProbe(vec4f((q.sun.rgb + ns) * keep, n * keep), vec4f((q.sky.rgb + nk) * keep, 0.0));
    } else {
        q = CloudScatterProbe(vec4f(0.0), vec4f(0.0));
    }
    cloud_scatter_store(w, q);
}
