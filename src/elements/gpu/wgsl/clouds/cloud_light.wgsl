// Luz das nuvens e a marcha (spec 041, R1, R7–R9): em cada passo com densidade, a profundidade ótica até o sol — o cone
// curto de 6 passos crescentes × 1,5 (Schneider 2015; o crescimento × 2 dele dava trechos de 16 passos base em que o
// ponto médio erra a borda da nuvem: −3 % de luz na mediana, medido) e, além dele, o mapa visto do sol (τ, nunca
// refeito de T: as oitavas usam `e^(−aⁱτ)` com τ de dezenas sob o sol baixo) —, o
// espalhamento múltiplo por oitavas (Wrenninge 2013: `Σ bⁱ σs e^(−aⁱ τ) p(cⁱ g)`), a luz do sol atenuada pela atmosfera
// até o ponto, o ambiente do céu (em cima) e do chão (embaixo) pela fração de altura, e a integral analítica do passo
// (Hillaire 2016). A marcha tem teto constante de passos (`CLOUD_MAX_STEPS`, o perfil escolhe menos) e de passos de luz
// (`CLOUD_MAX_LIGHT_STEPS`) e do pedaço até o nó do mapa (`CLOUD_SHADOW_PARTIAL_STEPS`): o orçamento total por
// invocação é `CLOUD_MAX_STEPS × (1 + CLOUD_MAX_LIGHT_STEPS + CLOUD_SHADOW_PARTIAL_STEPS)`.
// Espelho de `marchCloud` em `cloudModel.ts`.
// Requer: cloud_common, cloud_sun, cloud_density, cloud_phase, cloud_shadow_lookup, cloud_scatter_lookup, sky_query,
// clouds, cloud_ambient_tex.

const CLOUD_MAX_STEPS: u32 = 128u;
const CLOUD_MAX_LIGHT_STEPS: u32 = 6u;
/** Passos do pedaço do trecho do mapa visto do sol entre o fim do cone e o nó do lado do sol. */
const CLOUD_SHADOW_PARTIAL_STEPS: u32 = 4u;
const CLOUD_MAX_OCTAVES: u32 = 3u;
/** Amostras vazias seguidas que devolvem a marcha à velocidade grossa. */
const CLOUD_EMPTY_TO_COARSE: u32 = 6u;
/** Transmitância abaixo da qual a marcha para. */
const CLOUD_EARLY_EXIT: f32 = 0.01;

struct CloudSample {
    scattered: vec3f,
    transmittance: f32,
    /** Profundidade média ponderada pela opacidade (m); 0 sem nuvem. */
    depth: f32,
}

/**
 * Profundidade ótica da nuvem de `p` até o sol: o cone curto; do fim dele, o pedaço do trecho do mapa até o nó do lado
 * do sol, integrado aqui (`CLOUD_SHADOW_PARTIAL_STEPS` passos); e o nó, lido do mapa (a integral da coluna da entrada
 * da casca até ele). Medido em f64 com o sol a 4° (luz do sol por região contra τ exato): 16 nós com a marcha do
 * pedaço erram ≤ 2,2 %; 16 nós lineares, até 14 %; 4 nós lineares, até 50 %.
 */
fn cloud_sun_depth(p: vec3f, light_steps: u32) -> f32 {
    let sun = sky.sunDirection.xyz;
    let base = cloud_layer_thickness() / 48.0;
    var tau = 0.0;
    var t = 0.0;
    let n = min(light_steps, CLOUD_MAX_LIGHT_STEPS);
    for (var i = 0u; i < CLOUD_MAX_LIGHT_STEPS; i++) {
        if (i >= n) { break; }
        let len = base * 0.5 * pow(1.5, f32(i));
        tau += cloud_density(p + sun * (t + 0.5 * len), true) * len;
        t += len;
    }
    let q = p + sun * t;
    let c = cloud_shadow_column(q);
    if (c.w <= 0.0) { return tau * clouds.layer.z; }
    let k = u32(floor(c.z));
    // O perfil escolhe menos passos de luz; o pedaço segue: 4 no alto (6 de cone), 3 no médio, 2 no baixo.
    let m = clamp(n, 4u, 6u) - 2u;
    let dt = (c.z - f32(k)) / 16.0 * c.w / f32(m);
    for (var i = 0u; i < CLOUD_SHADOW_PARTIAL_STEPS; i++) {
        if (i >= m) { break; }
        tau += cloud_density(q + sun * ((f32(i) + 0.5) * dt), true) * dt;
    }
    return tau * clouds.layer.z + cloud_shadow_knot(c.xy, k);
}

/** Luz espalhada para a câmera por unidade de comprimento num ponto de extinção `sigma_t` (o sol e o ambiente). */
fn cloud_inscatter(p: vec3f, sigma_t: f32, cos_theta: f32, light_steps: u32) -> vec3f {
    let tau = cloud_sun_depth(p, light_steps);
    let o = clouds.octaves;
    let count = min(u32(o.x), CLOUD_MAX_OCTAVES);
    // A oitava 0 é o espalhamento simples exato; as demais e o ambiente local são a estimativa a que a luz das sondas do
    // cache de espalhamento (o transporte completo por caminhos, T023) se sobrepõe à medida que os caminhos chegam.
    // O feixe do sol no ponto: o não desviado e o desviado menos de 2° pelo pico de frente (δ-M), `e^(−(1 − ω·fc)τ)` — a
    // luz que os caminhos das sondas não alcançam (o pico é transmitido neles).
    let single = exp(-(1.0 - clouds.layer.w * clouds.phaseCut.y) * tau) * cloud_phase(cos_theta, 1.0);
    var s = 0.0;
    var energy = o.z;
    var attenuation = o.y;
    var anisotropy = o.w;
    for (var i = 1u; i < CLOUD_MAX_OCTAVES; i++) {
        if (i >= count) { break; }
        s += energy * exp(-attenuation * tau) * cloud_phase(cos_theta, anisotropy);
        energy *= o.z;
        attenuation *= o.y;
        anisotropy *= o.w;
    }
    let sun = sky.sunIlluminance.rgb * cloud_sun_atmosphere(p);
    let h = clamp(cloud_height_fraction(p), 0.0, 1.0);
    let ambient = textureLoad(cloud_ambient_tex, vec2u(0u, 0u), 0).rgb * h
        + textureLoad(cloud_ambient_tex, vec2u(1u, 0u), 0).rgb * (1.0 - h);
    let multiple = cloud_scatter_light(p, s * sun + ambient);
    return sigma_t * clouds.layer.w * (single * sun + multiple);
}

/**
 * A espessura (m) da camada que dita o passo da marcha e o cone da luz: a do tempo bom (o topo e a base da camada; sem o
 * tempo, a casca). Com o tempo a casca vai à tropopausa, mas os cúmulos rasos têm a escala de antes: o passo pela casca
 * inteira (153 m numa de 9,8 km, contra 25 m) amostrava as bordas finas com 6 × menos passos (o grão da `tempestade`).
 */
fn cloud_layer_thickness() -> f32 {
    return clouds.shell.w * clouds.weatherMap.x;
}

/** Trechos do raio (bins iguais entre a entrada e a saída da casca) com a ocupação marcada num u32. */
const CLOUD_RAY_BINS: u32 = 32u;

/**
 * A ocupação do raio `o + t·d` em [t0, t1] (spec 041, R19): `CLOUD_RAY_BINS` trechos iguais; um trecho está ocupado se a
 * altura do raio nele fica abaixo do topo das colunas das pontas (`cloud_column_top`: o teto da nuvem na coluna, pelo mapa
 * de cobertura) e dentro da casca; os vizinhos de um ocupado também (uma coluna alta entre as pontas). Com a casca até a
 * tropopausa, quase todo o raio passa acima das nuvens: o piso do passo pela parte ocupada (não pelo raio inteiro) e o
 * pulo dos trechos vazios. Sem o tempo, o topo é o da casca e o raio inteiro fica ocupado onde há cobertura.
 */
fn cloud_ray_occupancy(o: vec3f, d: vec3f, t0: f32, t1: f32) -> u32 {
    let bin = (t1 - t0) / f32(CLOUD_RAY_BINS);
    var x = o + d * t0;
    var h0 = cloud_height_fraction(x);
    var top0 = cloud_column_top(cloud_coverage_at(x.xz));
    var mask = 0u;
    for (var k = 0u; k < CLOUD_RAY_BINS; k++) {
        x = o + d * (t0 + f32(k + 1u) * bin);
        let h1 = cloud_height_fraction(x);
        let top1 = cloud_column_top(cloud_coverage_at(x.xz));
        let lo = min(h0, h1);
        let hi = max(h0, h1);
        if (hi > 0.0 && lo < 1.0 && lo < max(top0, top1)) { mask |= 1u << k; }
        h0 = h1;
        top0 = top1;
    }
    return mask | (mask << 1u) | (mask >> 1u);
}

/**
 * Marcha da camada pelo raio `o + t·d` até `t_max` (a superfície opaca): `steps` passos no máximo (teto
 * `CLOUD_MAX_STEPS`), passo que cresce com a distância e cobre a parte ocupada do raio (`cloud_ray_occupancy`), grosso no
 * vazio (só a forma) e fino com densidade, os trechos sem nuvem pulados, deslocamento inicial `jitter` ∈ [0, 1) de um
 * passo; saída antecipada com transmitância < 0,01. `pixel` é o ângulo (rad) do pixel da marcha: a pegada da amostra
 * da vista (`cloud_footprint`); 0 sem ela.
 */
fn cloud_integrate(o: vec3f, d: vec3f, t_max: f32, steps: u32, light_steps: u32, jitter: f32, pixel: f32) -> CloudSample {
    var result = CloudSample(vec3f(0.0), 1.0, 0.0);
    let segs = cloud_shell_segments(o, d, t_max);
    if (segs.y <= segs.x) { return result; }
    let n = max(min(steps, CLOUD_MAX_STEPS), 1u);
    let t_last = select(segs.y, segs.w, segs.w > segs.z);
    let mask = cloud_ray_occupancy(o, d, segs.x, t_last);
    if (mask == 0u) { return result; }
    let bin = (t_last - segs.x) / f32(CLOUD_RAY_BINS);
    let occupied = f32(countOneBits(mask)) * bin;
    let base = cloud_layer_thickness() / 64.0;
    let floor_step = occupied / f32(n);
    let cos_theta = dot(d, sky.sunDirection.xyz);
    // A grade dos passos deslocada de `jitter` passo para trás da entrada da casca (com o primeiro passo começando em
    // `entrada + jitter·passo`, o trecho antes dele nunca era amostrado). Fora da casca a densidade é zero.
    var t = segs.x - (1.0 - jitter) * max(base, floor_step);
    var seg_start = segs.x;
    var end = segs.y;
    var second = segs.w > segs.z;
    var fine = false;
    var empty = 0u;
    var weight = 0.0;
    var depth_sum = 0.0;
    for (var i = 0u; i < CLOUD_MAX_STEPS; i++) {
        if (i >= n) { break; }
        if (t >= end) {
            if (!second) { break; }
            second = false;
            t = max(t, segs.z);
            seg_start = segs.z;
            end = segs.w;
        }
        // O trecho vazio: pula para o próximo ocupado (o salto conta como um passo), na velocidade grossa.
        let b = u32(clamp(floor((t - segs.x) / bin), 0.0, f32(CLOUD_RAY_BINS - 1u)));
        if ((mask & (1u << b)) == 0u) {
            let ahead = mask & ~((2u << b) - 1u);
            if (ahead == 0u) { break; }
            t = segs.x + f32(firstTrailingBit(ahead)) * bin;
            fine = false;
            empty = 0u;
            continue;
        }
        // O passo fino cresce com a distância e não fica abaixo do piso que cobre a parte ocupada; o grosso (só a forma,
        // no vazio) é o dobro do fino sem o piso, nunca menos que o piso — quando o piso manda (raios longos, rente ao
        // horizonte), o passo grosso pularia pedaços de nuvem do tamanho dele (−9 % de luz a 17–30 km, medido na marcha
        // emulada em f64) e a marcha fica fina.
        let near_step = base * (1.0 + t / 8000.0);
        let fine_step = max(near_step, floor_step);
        let coarse_step = max(2.0 * near_step, floor_step);
        if (coarse_step <= fine_step) { fine = true; }
        let ds = min(select(coarse_step, fine_step, fine), end - t);
        let x = o + d * (t + 0.5 * ds);
        if (!fine) {
            if (cloud_density(x, false) > 0.0) {
                // Achou nuvem: a marcha fina recomeça meio passo grosso atrás (no ponto vazio da amostra grossa
                // anterior), onde a borda pode ter começado, sem voltar antes do trecho.
                fine = true;
                empty = 0u;
                t = max(t - 0.5 * ds, seg_start);
                continue;
            }
            t += ds;
            continue;
        }
        cloud_footprint = (t + 0.5 * ds) * pixel;
        let rho = cloud_density(x, true);
        cloud_footprint = 0.0;
        if (rho > 0.0) {
            empty = 0u;
            let sigma_t = rho * clouds.layer.z;
            let step_t = exp(-sigma_t * ds);
            let light = cloud_inscatter(x, sigma_t, cos_theta, light_steps);
            result.scattered += result.transmittance * light * (1.0 - step_t) / sigma_t;
            let alpha = result.transmittance * (1.0 - step_t);
            depth_sum += alpha * (t + 0.5 * ds);
            weight += alpha;
            result.transmittance *= step_t;
            if (result.transmittance < CLOUD_EARLY_EXIT) { break; }
        } else {
            empty++;
            if (empty >= CLOUD_EMPTY_TO_COARSE) { fine = false; }
        }
        t += ds;
    }
    result.depth = select(0.0, depth_sum / max(weight, 1e-12), weight > 0.0);
    return result;
}
