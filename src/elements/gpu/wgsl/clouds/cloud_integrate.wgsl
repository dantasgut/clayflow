// A marcha das nuvens por um raio (spec 041, R1, R2): passo que cresce com a distância e cobre a parte ocupada do raio,
// grosso no vazio e fino com densidade, os trechos sem nuvem pulados, e a integral analítica do passo (Hillaire 2016).
// Teto constante de passos (`CLOUD_MAX_STEPS`, o perfil escolhe menos). A luz de cada amostra com densidade entra pelo
// ponto `cloud_sample_light` (o ponto e a distância dele no raio): o pronto a calcula ali (`cloud_radiance`; o panorama),
// e a marcha da tela a adia para o passe da luz (`cloud_light_list.wgsl`, T074) — a soma é a mesma, em outra ordem.
// Espelho de `marchCloud` em `cloudModel.ts`.
// Requer: cloud_common, cloud_density, cloud_light, cloud_sample_light, cloud_sun_volume_lookup, sky, clouds.

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
        // A distância da amostra (o meio do passo): o ponto, a pegada e o que a lista da luz guarda dela saem dela.
        let tm = t + 0.5 * ds;
        let x = o + d * tm;
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
        cloud_footprint = tm * pixel;
        let rho = cloud_density(x, true);
        cloud_footprint = 0.0;
        if (rho > 0.0) {
            empty = 0u;
            let sigma_t = rho * clouds.layer.z;
            let step_t = exp(-sigma_t * ds);
            if (lit % CLOUD_AMBIENT_REUSE == 0u) { occ = cloud_ambient_occlusion(x); }
            lit++;
            // A pegada do pixel da marcha no ponto: o nível do volume de τ até o sol que a luz pode ler (T074).
            cloud_light_footprint = tm * pixel;
            let alpha = result.transmittance * (1.0 - step_t);
            let rest = result.transmittance * step_t;
            // Saída antecipada (spec 041, R21 rodada 16): o resto da nuvem conta como opaco. Devolver o T da saída (até
            // 0,01) deixava passar 1 % do fundo — o disco do sol (60 000 no alvo, ~10⁹ nits de verdade) aparecia como
            // um ponto branco através de um cúmulo de τ ~ 20–50 (T ~ 10⁻⁹ ou menos).
            // O resto da nuvem, opticamente espesso, espalha a fonte do último passo: a integral dele até o infinito com
            // a mesma fonte (`T·luz/σ`) — sem ela, a luz que o resto da nuvem manda à câmera sumia junto com o fundo (a
            // borda prateada rente ao horizonte no contraluz; `sunset` 6,3 → 5,9 % com a faixa de mistura dos níveis do
            // mapa visto do sol nos 8 % de fora, rodada 21).
            let exits = rest < CLOUD_EARLY_EXIT;
            // A luz da amostra com o peso dela na soma do raio: a integral do passo, `T·(1 − e^(−σ·ds))` (a luz por
            // unidade de profundidade ótica: o σ da fonte e o da integral se cancelam), mais o resto na saída.
            result.scattered += cloud_sample_light(x, tm, cos_theta, light_steps, occ, select(alpha, alpha + rest, exits));
            depth_sum += alpha * tm;
            weight += alpha;
            result.transmittance = rest;
            if (exits) {
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
