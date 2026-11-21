// Luz das nuvens e a marcha (spec 041, R1, R7–R9): em cada passo com densidade, a profundidade ótica até o sol — o cone
// curto de 6 passos crescentes × 1,5 (Schneider 2015; o crescimento × 2 dele dava trechos de 16 passos base em que o
// ponto médio erra a borda da nuvem: −3 % de luz na mediana, medido) e, além dele, o mapa visto do sol (τ, nunca
// refeito de T: as oitavas usam `e^(−aⁱτ)` com τ de dezenas sob o sol baixo) —, o
// espalhamento múltiplo por oitavas (Wrenninge 2013: `Σ bⁱ σs e^(−aⁱ τ) p(cⁱ g)`), a luz do sol atenuada pela atmosfera
// até o ponto, o ambiente do céu (em cima) e do chão (embaixo) pela fração de altura, e a integral analítica do passo
// (Hillaire 2016). A marcha tem teto constante de passos (`CLOUD_MAX_STEPS`, o perfil escolhe menos) e de passos de luz
// (`CLOUD_MAX_LIGHT_STEPS`) e do pedaço até o nó do mapa (`CLOUD_SHADOW_PARTIAL_STEPS`, `cloud_sun_rest`): o orçamento
// total por invocação é `CLOUD_MAX_STEPS × (2 + CLOUD_MAX_LIGHT_STEPS + CLOUD_SHADOW_PARTIAL_STEPS)` (a coluna do
// ambiente local, uma amostra); com o volume de τ até o sol (T074), uma amostra do cone e uma leitura do volume.
// Espelho de `marchCloud` em `cloudModel.ts`.
// Requer: cloud_common, cloud_sun, cloud_density, cloud_phase, cloud_shadow_lookup, cloud_scatter_lookup,
// cloud_sun_rest, cloud_sun_volume_lookup, sky_query, clouds, cloud_ambient_tex.

const CLOUD_MAX_STEPS: u32 = 128u;
const CLOUD_MAX_LIGHT_STEPS: u32 = 6u;
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
 * Profundidade ótica da nuvem de `p` até o sol: o cone curto; do fim dele, o pedaço do trecho do mapa até o meio nó do
 * lado do sol (os 16 nós e os do meio dos trechos, T074), integrado aqui (`CLOUD_SHADOW_PARTIAL_STEPS` passos); e o meio
 * nó, lido do mapa (a integral da coluna da entrada da casca até ele). Medido em f64 com o sol a 4° (luz do sol por região
 * contra τ exato): 16 nós com a marcha do pedaço erram ≤ 2,2 %; 16 nós lineares, até 14 %; 4 nós lineares, até 50 %. O
 * pedaço até o meio nó em 2 passos erra em τ 1,70 % contra 2,34 % do até o nó inteiro em 4 (`cloudShadowPages.test.ts`).
 * Perto da câmera (T074), o cone além da primeira amostra pelo volume de τ até o sol (`cloud_sun_volume_at`: os nós a
 * 50 m, refeitos pela mudança medida), onde a página dele vale e os passos são os do volume (os da marcha do perfil): em
 * f64, 2,4–3,0 % de erro no τ do cone contra 3,7 % das 6 amostras (`cloudSunVolume.test.ts`), com uma amostra da
 * densidade e oito leituras do volume no lugar de seis amostras.
 */
fn cloud_sun_depth(p: vec3f, light_steps: u32) -> f32 {
    let sun = sky.sunDirection.xyz;
    let base = cloud_layer_thickness() / 48.0;
    let n = min(light_steps, CLOUD_MAX_LIGHT_STEPS);
    // O volume (os passos dele são os da marcha do perfil): a primeira amostra do cone no ponto (a borda escura, que os
    // nós alisariam) e o resto do cone pelos nós; o resto da luz também, onde ele vale.
    var volume = vec3f(-1.0, -1.0, 0.0);
    if (light_steps == clouds.march.y) {
        volume = cloud_sun_volume_at(p + sun * clouds.sunVolume.z, cloud_light_footprint);
    }
    let d0 = clouds.sunVolume.z;
    if (volume.x >= 0.0 && volume.z >= 1.0) {
        let tau = cloud_density(p + sun * (0.5 * d0), true) * d0 * clouds.layer.z + volume.x;
        if (volume.y >= 0.0) { return tau + volume.y; }
        return tau + cloud_sun_rest(p + sun * (d0 + clouds.sunVolume.y), n);
    }
    var rho = 0.0;
    var t = 0.0;
    for (var i = 0u; i < CLOUD_MAX_LIGHT_STEPS; i++) {
        if (i >= n) { break; }
        let len = base * 0.5 * pow(1.5, f32(i));
        rho += cloud_density(p + sun * (t + 0.5 * len), true) * len;
        t += len;
    }
    var tau = rho * clouds.layer.z;
    // No anel de fora do último nível (ou com a página seguinte que não vale), o volume sai aos poucos para o cone.
    if (volume.x >= 0.0) {
        let near = cloud_density(p + sun * (0.5 * d0), true) * d0 * clouds.layer.z + volume.x;
        tau = mix(tau, near, volume.z);
    }
    return tau + cloud_sun_rest(p + sun * t, n);
}

/**
 * A transmitância difusa de uma camada de profundidade ótica `tau` sem absorção (duas correntes, Eddington: Bohren 1987,
 * `1/(1 + ¾(1 − g)τ)`, g o parâmetro de assimetria das gotículas): a fração da luz difusa que atravessa a nuvem.
 */
const CLOUD_DIFFUSE_ASYMMETRY: f32 = 0.85;

fn cloud_diffuse_transmittance(tau: f32) -> f32 {
    return 1.0 / (1.0 + 0.75 * (1.0 - CLOUD_DIFFUSE_ASYMMETRY) * tau);
}

/**
 * O ambiente local da estimativa das oitavas em `p` (spec 041, R19): o céu (em cima) e o chão (embaixo) pela fração de
 * altura, atenuados pela própria nuvem: pela maior das transmitâncias difusas da coluna acima do ponto e do caminho até
 * o sol (`tau_sun`, já calculado: a parede da torre vê o céu e o chão de lado; a coluna, a luz que passa por cima). A
 * coluna (`cloud_ambient_occlusion`): a cobertura local × o trecho até o topo da coluna, lida na primeira amostra com
 * densidade de cada raio e a cada `CLOUD_AMBIENT_REUSE` depois (a coluna muda devagar ao longo do raio; com 5 amostras e
 * o chão pelo mapa visto do sol, o perfil alto passava de 3 ms). Sem a oclusão, a base de um cúmulo-nimbo de 10 km
 * recebia o céu inteiro na estimativa, que pesa ≥ 20 % contra os caminhos das sondas (`CLOUD_SCATTER_PRIOR` em 64 + 16):
 * a base cinza, não chumbo. Espelho de `ambientLocal` em `cloudModel.ts`.
 */
const CLOUD_AMBIENT_REUSE: u32 = 8u;

/**
 * A transmitância difusa da coluna de nuvem acima de `p`: a profundidade ótica pela cobertura local do mapa (a fração do
 * ar com nuvem na coluna, o campo liso de 250 m) do ponto ao topo da coluna. Uma amostra do volume no meio do trecho
 * acertava ou errava os buracos da forma de uma coluna à outra: manchas de 1 km na base do cúmulo-nimbo.
 */
fn cloud_ambient_occlusion(p: vec3f) -> f32 {
    let cov = cloud_coverage_at(p.xz);
    let top = clouds.shell.y + cloud_column_top(cov) * clouds.shell.w;
    let above = max(top - cloud_altitude(p), 0.0);
    return cloud_diffuse_transmittance(max(cov.x, 0.0) * above * clouds.layer.z);
}

fn cloud_ambient_local(p: vec3f, tau_sun: f32, occ: f32) -> vec3f {
    let h = clamp(cloud_height_fraction(p), 0.0, 1.0);
    let up = textureLoad(cloud_ambient_tex, vec2u(0u, 0u), 0).rgb;
    let down = textureLoad(cloud_ambient_tex, vec2u(1u, 0u), 0).rgb;
    return (up * h + down * (1.0 - h)) * max(occ, cloud_diffuse_transmittance(tau_sun));
}

/** Luz espalhada para a câmera por unidade de comprimento num ponto de extinção `sigma_t` (o sol e o ambiente). */
fn cloud_inscatter(p: vec3f, sigma_t: f32, cos_theta: f32, light_steps: u32, occ: f32) -> vec3f {
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
    let atm = cloud_sun_atmosphere(p);
    let sun = sky.sunIlluminance.rgb * atm;
    let multiple = cloud_scatter_light(p, s * sun + cloud_ambient_local(p, tau, occ), atm);
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
 * Devolve as duas máscaras: `x` pelo topo das colunas (o piso do passo, como antes) e `y` pela faixa de altura em que a
 * coluna pode ter nuvem no trecho (`cloud_column_band_span`: sem o tempo, o perfil acima de `1 − cobertura` com a cobertura
 * e o tipo que o campo alcança entre as pontas; T074) — o pulo do vazio, sem mudar o passo.
 */
fn cloud_ray_occupancy(o: vec3f, d: vec3f, t0: f32, t1: f32) -> vec2u {
    let bin = (t1 - t0) / f32(CLOUD_RAY_BINS);
    var x = o + d * t0;
    var h0 = cloud_height_fraction(x);
    var cov0 = cloud_coverage_at(x.xz);
    var mask = 0u;
    var band_mask = 0u;
    for (var k = 0u; k < CLOUD_RAY_BINS; k++) {
        x = o + d * (t0 + f32(k + 1u) * bin);
        let h1 = cloud_height_fraction(x);
        let cov1 = cloud_coverage_at(x.xz);
        let lo = min(h0, h1);
        let hi = max(h0, h1);
        if (hi > 0.0 && lo < 1.0 && lo < max(cloud_column_top(cov0), cloud_column_top(cov1))) {
            mask |= 1u << k;
            let band = cloud_column_band_span(cov0, cov1, bin);
            if (hi > band.x && lo < band.y) { band_mask |= 1u << k; }
        }
        h0 = h1;
        cov0 = cov1;
    }
    return vec2u(mask | (mask << 1u) | (mask >> 1u), band_mask | (band_mask << 1u) | (band_mask >> 1u));
}

/**
 * Marcha da camada pelo raio `o + t·d` até `t_max` (a superfície opaca): `steps` passos no máximo (teto
 * `CLOUD_MAX_STEPS`), passo que cresce com a distância e cobre a parte ocupada do raio (`cloud_ray_occupancy`), grosso no
 * vazio (só a forma) e fino com densidade, os trechos sem nuvem pulados, deslocamento inicial `jitter` ∈ [0, 1) de um
 * passo; saída antecipada com transmitância < 0,01 (o resto da nuvem conta como opaco: T = 0). `pixel` é o ângulo (rad) do pixel da marcha: a pegada da amostra
 * da vista (`cloud_footprint`); 0 sem ela.
 */
fn cloud_integrate(o: vec3f, d: vec3f, t_max: f32, steps: u32, light_steps: u32, jitter: f32, pixel: f32) -> CloudSample {
    var result = CloudSample(vec3f(0.0), 1.0, 0.0);
    let segs = cloud_shell_segments(o, d, t_max);
    if (segs.y <= segs.x) { return result; }
    let n = max(min(steps, CLOUD_MAX_STEPS), 1u);
    let t_last = select(segs.y, segs.w, segs.w > segs.z);
    let masks = cloud_ray_occupancy(o, d, segs.x, t_last);
    // O piso do passo pela ocupação pelo topo das colunas; o pulo pela faixa em que a nuvem pode existir (os trechos fora
    // dela têm densidade nula: pulá-los não muda a integral).
    let mask = masks.y;
    if (mask == 0u) { return result; }
    let bin = (t_last - segs.x) / f32(CLOUD_RAY_BINS);
    let occupied = f32(countOneBits(masks.x)) * bin;
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
    // A coluna do ambiente local, relida a cada `CLOUD_AMBIENT_REUSE` amostras com densidade.
    var occ = 1.0;
    var lit = 0u;
    // O trecho do último pulo: o `t` do pulo é a borda do trecho e `(t − entrada)/trecho` em f32 pode sair um ULP abaixo
    // dela — o trecho de antes (vazio) de novo, o pulo de volta para a mesma borda e o passo gasto, até o teto (T074: a
    // metade dos raios saía sem nuvem, `noon` com a transmitância 0,47 contra 0). O `t` só cresce: o trecho nunca volta.
    var at_bin = 0u;
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
        let b = max(u32(clamp(floor((t - segs.x) / bin), 0.0, f32(CLOUD_RAY_BINS - 1u))), at_bin);
        if ((mask & (1u << b)) == 0u) {
            let ahead = mask & ~((2u << b) - 1u);
            if (ahead == 0u) { break; }
            at_bin = firstTrailingBit(ahead);
            t = segs.x + f32(at_bin) * bin;
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
            if (lit % CLOUD_AMBIENT_REUSE == 0u) { occ = cloud_ambient_occlusion(x); }
            lit++;
            // A pegada do pixel da marcha no ponto: o nível do volume de τ até o sol que a luz pode ler (T074).
            cloud_light_footprint = (t + 0.5 * ds) * pixel;
            let light = cloud_inscatter(x, sigma_t, cos_theta, light_steps, occ);
            result.scattered += result.transmittance * light * (1.0 - step_t) / sigma_t;
            let alpha = result.transmittance * (1.0 - step_t);
            depth_sum += alpha * (t + 0.5 * ds);
            weight += alpha;
            result.transmittance *= step_t;
            // Saída antecipada (spec 041, R21 rodada 16): o resto da nuvem conta como opaco. Devolver o T da saída (até
            // 0,01) deixava passar 1 % do fundo — o disco do sol (60 000 no alvo, ~10⁹ nits de verdade) aparecia como
            // um ponto branco através de um cúmulo de τ ~ 20–50 (T ~ 10⁻⁹ ou menos).
            // O resto da nuvem, opticamente espesso, espalha a fonte do último passo: a integral dele até o infinito com
            // a mesma fonte (`T·luz/σ`) — sem ela, a luz que o resto da nuvem manda à câmera sumia junto com o fundo (a
            // borda prateada rente ao horizonte no contraluz; `sunset` 6,3 → 5,9 % com a faixa de mistura dos níveis do
            // mapa visto do sol nos 8 % de fora, rodada 21).
            if (result.transmittance < CLOUD_EARLY_EXIT) {
                result.scattered += result.transmittance * light / sigma_t;
                result.transmittance = 0.0;
                break;
            }
        } else {
            empty++;
            if (empty >= CLOUD_EMPTY_TO_COARSE) { fine = false; }
        }
        t += ds;
    }
    result.depth = select(0.0, depth_sum / max(weight, 1e-12), weight > 0.0);
    return result;
}
