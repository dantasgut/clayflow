// Reconstrução temporal das nuvens (spec 041, R2): o alvo reconstruído (¼ da tela; 1/16 no perfil baixo), série temporal da 037 (`march` e `marchDepth`,
// lidas pelo atraso 1). Os pixels do bloco vêm do histórico reprojetado pela posição da nuvem (a câmera atual e a
// profundidade da nuvem do quadro anterior) e pelo vento (onde a nuvem estava: o ponto menos o vento × Δt); o pixel
// marchado mistura o valor exato a ele (média exponencial). O gradiente temporal da 034, filtrado nos 3 × 3 blocos em
// volta, decide a validade: se a média dos históricos reprojetados nos pixels marchados diverge da média dos valores
// exatos além da tolerância, o bloco larga o histórico (em rampa: `cloud_history_reset`) e os pixels dele tomam o valor
// exato interpolado no lugar de cada um entre os pixels marchados dos blocos vizinhos (`cloud_fresh_at`), com o histórico
// que fica recortado pela caixa. O recorte do histórico pela caixa
// dos valores exatos dos 3 × 3 blocos só onde a reprojeção é incerta: a profundidade da nuvem é a média de um trecho, e
// a câmera que anda (o `voo`) leva o histórico de outro lugar; parada ou girando, a reprojeção não depende da
// profundidade e o histórico é exato — a caixa tem uma amostra por bloco, e o detalhe claro menor que o bloco (a borda
// prateada das nuvens a 50–100 km perto do sol baixo, a faixa rente ao horizonte) ficava fora dela em quase todo quadro e
// era recortado (`sunset`: −35 % de luz nas linhas junto ao sol). Sem histórico válido (corte, recriação, primeiro
// quadro), o valor exato interpolado.
// A superfície (spec 041): cada texel marcha até a superfície mais próxima dos pixels da tela dele, e o valor guarda até
// onde foi (`cloud_march_depth_out.g`). O histórico é lido só dos texels marchados até a mesma superfície de agora, e o valor do bloco
// é o do pixel marchado dele só se este for da mesma superfície; senão, o do bloco vizinho (3 × 3) mais parecido. Na borda
// do chão contra o céu, o texel do chão recebia o valor do pixel marchado no céu (a nuvem rente ao horizonte) e o do céu
// o do chão (sem nuvem): com o deslocamento da amostra mudando a superfície dos pixels a cada quadro, o horizonte tremia em
// blocos.
// Espelho de `reference/cloudReconstruct.ts`.
// Despacho linear: um texel por invocação.
// O vento da reprojeção é `cloud_wind_at` (o uniforme da camada; com o tempo, o do quadrado do tempo no ponto, R19).
// Requer: WORKGROUP_SIZE, color, cloud_common, cloud_march_bayer, cloud_scene_limit, cloud_scene_depth, camera_space, clouds, cameras,
// cloud_wind_at, cloud_trace, cloud_trace_depth, cloud_march_prev,
// cloud_march_depth_prev, cloud_march_out, cloud_march_depth_out, cloud_check, cloud_check_noise, cloud_check_out,
// cloud_check_noise_out.
// Dois pontos de entrada: `cloud_check_main` (um bloco por invocação, depois da marcha: o histórico reprojetado no pixel
// marchado do bloco e a variância temporal guardada com ele) e `cloud_reconstruct_main` (um texel por invocação), que lê
// a janela do gradiente nos blocos sem refazer as reprojeções (antes, cada texel refazia as dos 3 × 3 blocos).

/** Folga da caixa do recorte do histórico (fração da largura dela). */
const CLOUD_BOX_PAD: f32 = 0.5;
/** Tolerância do gradiente temporal: diferença relativa da luz mais a da transmitância. */
const CLOUD_GRADIENT_TOLERANCE: f32 = 0.2;
/**
 * Peso do valor novo no pixel marchado (média exponencial sobre o histórico): a amostra de um deslocamento
 * inicial aleatório entra aos poucos, e o ruído do deslocamento não cintila a cada vez que o bloco é marchado.
 */
const CLOUD_HISTORY_BLEND: f32 = 0.25;
/**
 * Quanto do desvio medido entre as médias dos valores exatos e dos históricos nos marchados da janela o histórico de todos
 * os texels segue no quadro (`cloud_history_follow`). Um texel do bloco 2 × 2 é marchado a cada quatro quadros: com a luz
 * mudando (o sol que anda no `solposto`), os quatro texels ficavam com idades de 0 a 3 quadros na média exponencial — a
 * grade de 2·S px a olho no alto alaranjado das nuvens — e o histórico ~13 quadros atrás da luz. Seguindo ½ por quadro
 * (sem ruído), ~1 quadro atrás e as idades do bloco a ~0,2 quadro de mudança uma da outra.
 */
const CLOUD_HISTORY_FOLLOW: f32 = 0.5;
/**
 * A mudança relativa da luz por quadro que o seguimento espera (o ganho de Kalman `τ²/(τ² + σ²)` contra o erro padrão
 * relativo `σ` da média dos valores exatos da janela, pela variância temporal guardada): onde o ruído de uma amostra
 * domina (a faixa clara de 1–2 px rente ao horizonte, que a amostra ora acerta ora não), o histórico não segue o ruído —
 * seguindo sempre, a luz junto ao sol no `sunset` caía 3,7 → 7,6 % abaixo da referência (o histórico ruidoso largado e
 * recortado pela caixa).
 */
const CLOUD_FOLLOW_CHANGE: f32 = 0.1;

/**
 * Onde o ponto do pixel `q` (¼ da tela) à distância `d` (m) estava no quadro anterior (normalizado na tela; z = 1 se dentro
 * dela): a câmera atual e o vento (o ponto menos o vento × Δt). O raio pelo centro do texel sem o deslocamento da amostra
 * do antisserrilhado temporal (`camera_ray` dá o da amostra deslocada): o texel guarda a média da área do pixel, e a
 * matriz anterior é a sem o deslocamento. Com o raio deslocado, a leitura bilinear do histórico caía a ±¼ de texel do
 * centro, outro a cada quadro, e os pixels não marchados (três em quatro por quadro) o filtravam de novo a cada quadro:
 * com a câmera parada, o histórico se difundia — a faixa de 1–2 px rente ao horizonte saía espalhada por 6–8 linhas
 * (`sunset`).
 */
fn cloud_previous_uv(q: vec2u, full: vec2f, d: f32) -> vec3f {
    let slot = clouds.march.w;
    let ndc = pixel_to_ndc((vec2f(q) + 0.5) * f32(cloud_march_scale()), full) + cameras[slot].jitter.xy;
    let ray = camera_ray_ndc(slot, ndc);
    let world = ray.origin + ray.dir * d;
    let wind = cloud_wind_at(world);
    let before = world - vec3f(wind.x, 0.0, wind.y) * clouds.timing.x;
    let clip = cameras[slot].previousViewProjection * vec4f(before, 1.0);
    if (clip.w <= 0.0) { return vec3f(0.0, 0.0, 0.0); }
    let uv = ndc_to_uv(clip.xy / clip.w);
    return vec3f(uv, select(0.0, 1.0, all(uv >= vec2f(0.0)) && all(uv <= vec2f(1.0))));
}

/** A profundidade guardada da nuvem no texel `q` do quadro anterior (m; sem nuvem, a do fundo). */
fn cloud_history_depth(q: vec2u) -> f32 {
    let prev_depth = textureLoad(cloud_march_depth_prev, q, 0).r;
    return select(1e7, prev_depth, prev_depth > 0.0);
}

/**
 * Fator de profundidade da incerteza da reprojeção: a profundidade guardada é a média da opacidade ao longo de um trecho
 * da nuvem, e a luz vem de pontos até este fator mais perto ou mais longe.
 */
const CLOUD_DEPTH_SPREAD: f32 = 2.0;
/** Deslocamentos (texels) da reprojeção entre as profundidades do trecho: abaixo do primeiro, o histórico é exato (sem
 * recorte); a partir do segundo, recorte inteiro. */
const CLOUD_PARALLAX_EXACT: f32 = 0.25;
const CLOUD_PARALLAX_CLIP: f32 = 1.0;

/**
 * Quanto o histórico do texel `q` deve ser recortado (0…1): o deslocamento da reprojeção dele (texels do alvo) quando a
 * profundidade vai de `d/CLOUD_DEPTH_SPREAD` a `d·CLOUD_DEPTH_SPREAD` — a paralaxe da câmera que anda (e do vento, que
 * leva os pontos perto mais pixels que os longe). Parada ou girando, 0.
 */
fn cloud_reprojection_clip(q: vec2u, full: vec2f) -> f32 {
    let d = cloud_history_depth(q);
    let dims = vec2f(textureDimensions(cloud_march_prev));
    let mid = cloud_previous_uv(q, full, d);
    let near = cloud_previous_uv(q, full, d / CLOUD_DEPTH_SPREAD);
    let far = cloud_previous_uv(q, full, d * CLOUD_DEPTH_SPREAD);
    if (mid.z * near.z * far.z < 0.5) { return 1.0; }
    let spread = max(length((near.xy - mid.xy) * dims), length((far.xy - mid.xy) * dims));
    return clamp((spread - CLOUD_PARALLAX_EXACT) / (CLOUD_PARALLAX_CLIP - CLOUD_PARALLAX_EXACT), 0.0, 1.0);
}

/** O histórico reprojetado de um pixel: o valor (`a` < 0: nenhum) e o segundo momento temporal guardado com ele. */
struct CloudHistory {
    value: vec4f,
    moments: vec2f,
}

/**
 * O histórico no pixel `q` (¼ da tela) reprojetado, só dos texels marchados até a superfície `surface` (m): a leitura
 * bilinear dos quatro vizinhos, cada um pesado pela concordância da superfície guardada com ele (com a câmera andando, a
 * leitura na silhueta do chão contra o céu misturava o valor de um ao outro); `value.a` < 0 quando sai da tela ou nenhum
 * dos quatro é da mesma superfície. O segundo momento temporal (o brilho² e a transmitância², `cloud_march_depth_prev.ba`)
 * vem nas mesmas leituras da superfície guardada.
 */
fn cloud_history_at(q: vec2u, full: vec2f, surface: f32) -> CloudHistory {
    let none = CloudHistory(vec4f(0.0, 0.0, 0.0, -1.0), vec2f(0.0));
    let prev = cloud_previous_uv(q, full, cloud_history_depth(q));
    if (prev.z < 0.5) { return none; }
    let uv = prev.xy;
    let dims = vec2i(textureDimensions(cloud_march_prev));
    let p = uv * vec2f(dims) - 0.5;
    let base = vec2i(floor(p));
    let f = p - floor(p);
    var sum = vec4f(0.0);
    var msum = vec2f(0.0);
    var weight = 0.0;
    for (var k = 0; k < 4; k++) {
        let o = vec2i(k & 1, k >> 1);
        let t = clamp(base + o, vec2i(0), dims - 1);
        let bil = select(1.0 - f.x, f.x, o.x == 1) * select(1.0 - f.y, f.y, o.y == 1);
        let stored = textureLoad(cloud_march_depth_prev, t, 0);
        let same = cloud_surface_differs(stored.g, surface) <= CLOUD_SURFACE_AGREE;
        let w = select(0.0, bil, same);
        sum += textureLoad(cloud_march_prev, t, 0) * w;
        msum += stored.ba * w;
        weight += w;
    }
    if (weight < 1e-3) { return none; }
    return CloudHistory(sum / weight, msum / weight);
}

/**
 * Desvios do erro padrão temporal na tolerância do gradiente: a variância de uma amostra no pixel marchado de cada bloco
 * (o segundo momento guardado menos o quadrado do histórico) mede o ruído do ponto aleatório no pixel e do deslocamento
 * inicial, que a dispersão entre os blocos não vê — na faixa de 1–2 px rente ao horizonte (as nuvens a 50–100 km com o
 * sol a 4°), a amostra de um pixel de ¼ ora acerta a faixa clara ora não, a média dos 9 divergia do histórico só pelo
 * ruído, e o bloco largava o histórico: os quatro pixels dele com o valor de um (a faixa espalhada em blocos de 4 × 4 px e
 * sobre o chão; `sunset`, 13,9 %).
 */
const CLOUD_TEMPORAL_NOISE: f32 = 2.0;

/**
 * O ruído esperado na divergência das médias dos 3 × 3 blocos (spec 041, R19): o erro padrão da média dos `n` valores
 * exatos (uma amostra cada, com o deslocamento inicial e o ponto do pixel aleatórios), na mesma medida de
 * `cloud_divergence`, × `CLOUD_GRADIENT_NOISE` desvios — o da transmitância e, só onde ela varia entre os blocos (a
 * borda: `min(1, 4σ_a)`), o da luz relativa. A dispersão da luz nos blocos opacos é a estrutura da imagem, não o ruído
 * da amostra: com ela inteira na tolerância, o histórico ficava com o sol que anda (o `sunset`, 14,2 → 18,3 %). O gradiente temporal mede a mudança da nuvem, não o ruído da
 * amostra (na A-SVGF de Schied et al. 2018 a mesma semente cancela o ruído; aqui a tolerância o descarta): na borda rala,
 * com as amostras ora na nuvem ora fora, a média de 9 diverge do histórico só pelo ruído, e o bloco largava o histórico a
 * cada marcha — o grão das bordas ralas com o tempo acelerado (a borda de um cúmulo na `tempestade`: o passa-alta temporal
 * 0,96 → 0,57 nível sem largar nunca). O fator é o meio-termo medido contra o atraso: com 2 desvios a borda ia a 0,76, mas
 * no `storm` (o tempo andando) o histórico mantido atrasava a luz (1,6 → 5,1 %); com ½, 3,9 %. `mean` a média (rgb, a), `sq` as médias dos quadrados (brilho, a).
 */
const CLOUD_GRADIENT_NOISE: f32 = 0.5;

fn cloud_gradient_noise(mean: vec4f, sq: vec2f, n: f32) -> f32 {
    let lm = luminance(mean.rgb);
    let sl = sqrt(max(sq.x - lm * lm, 0.0));
    let sa = sqrt(max(sq.y - mean.a * mean.a, 0.0));
    return CLOUD_GRADIENT_NOISE * (sa + 0.5 * sl / max(lm, 1e-4) * min(1.0, 4.0 * sa)) / sqrt(max(n, 1.0));
}

/** Divergência entre o histórico e o valor exato (relativa na luz, absoluta na transmitância). */
fn cloud_divergence(a: vec4f, b: vec4f) -> f32 {
    let la = luminance(a.rgb);
    let lb = luminance(b.rgb);
    return abs(la - lb) / max(max(la, lb), 1e-4) * 0.5 + abs(a.a - b.a);
}

/**
 * O valor exato no texel `q` do alvo reconstruído: a interpolação bilinear dos pixels marchados neste quadro (um por
 * bloco 2 × 2, todos no mesmo lugar do bloco — `cloud_bayer` —: uma grade regular de passo 2 texels), só dos marchados
 * até a superfície `own` (m); no pixel marchado, o valor dele. Sem nenhum da mesma superfície, `fallback` (o do bloco
 * vizinho mais parecido). O valor de um pixel marchado copiado nos quatro texels do bloco (o vizinho mais próximo) dava
 * blocos de 2·S pixels da tela com uma amostra cada onde o bloco larga o histórico — o mosaico na base escura das nuvens
 * do pôr do sol, com o sol andando (`solposto`, quadro 1000), e a borda dos vãos em degraus.
 */
fn cloud_fresh_at(q: vec2u, own: f32, fallback: vec4f) -> vec4f {
    let blocks = vec2i(textureDimensions(cloud_trace));
    let rel = vec2i(q) - vec2i(cloud_bayer(clouds.march.z));
    let b0 = vec2i(floor(vec2f(rel) * 0.5));
    // A fração na grade dos marchados: 0 no marchado do bloco, ½ entre dois.
    let f = vec2f(rel - 2 * b0) * 0.5;
    var sum = vec4f(0.0);
    var weight = 0.0;
    for (var k = 0; k < 4; k++) {
        let o = vec2i(k & 1, k >> 1);
        let bil = select(1.0 - f.x, f.x, o.x == 1) * select(1.0 - f.y, f.y, o.y == 1);
        if (bil <= 0.0) { continue; }
        let nb = clamp(b0 + o, vec2i(0), blocks - 1);
        let same = cloud_surface_differs(textureLoad(cloud_trace_depth, nb, 0).g, own) <= CLOUD_SURFACE_AGREE;
        let w = select(0.0, bil, same);
        sum += textureLoad(cloud_trace, nb, 0) * w;
        weight += w;
    }
    if (weight < 1e-3) { return fallback; }
    return sum / weight;
}

/**
 * O peso do bloco `o` (−1…2 a partir do bloco do marchado à esquerda/acima do texel) na janela do gradiente de um texel à
 * fração `f` da grade dos marchados (0 no marchado, ½ entre dois): `max(2 − |o − f|, 0)` nos dois eixos — [1, 2, 1] e
 * [1, 3, 3, 1]. A janela anda com o texel (o gradiente e o seguimento contínuos de um texel ao vizinho, sem degrau na
 * borda do bloco) e a resposta em frequência dela não é negativa: o seguimento amortece todo modo do erro entre os
 * blocos. A média 3 × 3 de pesos iguais em volta do bloco tem −⅓ na frequência de Nyquist num eixo — a faixa de blocos
 * alternados crescia a cada quadro (o degrau de 6–9 × na borda dos blocos) — e dava o mesmo gradiente aos quatro texels
 * do bloco (o degrau na borda dele onde o bloco larga o histórico em parte). Espelho de `cloudGradientWeight`.
 */
fn cloud_gradient_weight(o: vec2i, f: vec2f) -> f32 {
    let w = max(vec2f(2.0) - abs(vec2f(o) - f), vec2f(0.0));
    return w.x * w.y;
}

/**
 * O fator de cada canal da luz que o histórico segue (espelho de `cloudHistoryFollow`): `1 + β·(F − C)/D` com `F` e `C`
 * as médias ponderadas dos valores exatos e dos históricos nos marchados da janela e `D = C + (α/2)(F − C)` — o
 * denominador sem viés pelo ruído (na razão `F/C`, `E[1/C] > 1/E[C]` puxava o fator para cima; com o peso α/2 do valor
 * exato os termos de segunda ordem de `F` e de `C` se cancelam, a variância do histórico na média exponencial sendo
 * α/(2 − α) da de uma amostra), × o ganho `β·τ²/(τ² + σ²)` (`noise` = σ, o erro padrão relativo da média dos valores
 * exatos). Sem limite que corte só um lado: a cauda de cima (a amostra que acerta o detalhe claro) cortada puxava a luz
 * para baixo; o fator nunca passa de `1 − β/(1 − α/2)` para baixo.
 */
fn cloud_history_follow(fresh_mean: vec4f, check_mean: vec4f, noise: f32) -> vec3f {
    let eps = 1e-3 * max(luminance(check_mean.rgb), 1e-6) + 1e-9;
    let d = check_mean.rgb + 0.5 * CLOUD_HISTORY_BLEND * (fresh_mean.rgb - check_mean.rgb) + eps;
    let tau2 = CLOUD_FOLLOW_CHANGE * CLOUD_FOLLOW_CHANGE;
    let gain = CLOUD_HISTORY_FOLLOW * tau2 / (tau2 + noise * noise);
    return max(vec3f(1.0) + gain * (fresh_mean.rgb - check_mean.rgb) / d, vec3f(0.0));
}

/**
 * O histórico no pixel marchado de cada bloco (um bloco por invocação, depois da marcha): reprojetado até a superfície
 * guardada com o valor exato do bloco (`a` < 0: nenhum, ou sem série válida) e a variância temporal de uma amostra nele
 * (o segundo momento guardado menos o quadrado do histórico: o brilho e a transmitância).
 */
@compute @workgroup_size(WORKGROUP_SIZE)
fn cloud_check_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let blocks = textureDimensions(cloud_trace);
    let i = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    if (i >= blocks.x * blocks.y) { return; }
    let nb = vec2u(i % blocks.x, i / blocks.x);
    var value = vec4f(0.0, 0.0, 0.0, -1.0);
    var variance = vec2f(0.0);
    if (clouds.flags.x == 1u && cameras[clouds.march.w].history.x < 0.5) {
        let size = textureDimensions(cloud_march_prev);
        let full = vec2f(size * cloud_march_scale());
        let mq = min(nb * 2u + cloud_bayer(clouds.march.z), size - 1u);
        let hn = cloud_history_at(mq, full, textureLoad(cloud_trace_depth, nb, 0).g);
        value = hn.value;
        let lh = luminance(value.rgb);
        variance = max(hn.moments - vec2f(lh * lh, value.a * value.a), vec2f(0.0));
    }
    textureStore(cloud_check_out, nb, value);
    textureStore(cloud_check_noise_out, nb, vec4f(variance, 0.0, 0.0));
}

/**
 * Quanto o bloco larga o histórico (0…1) pela divergência `d` das médias dos 3 × 3 blocos e a tolerância `allowance`
 * (a fixa mais o ruído esperado): nada até a tolerância, tudo a 1,5 × ela. O degrau (tudo ou nada) dava blocos vizinhos
 * em estados opostos onde a luz muda depressa (o sol rente ao horizonte): uns com o histórico, outros com o valor exato.
 */
fn cloud_history_reset(d: f32, allowance: f32) -> f32 {
    return clamp(2.0 * (d / max(allowance, 1e-6) - 1.0), 0.0, 1.0);
}

@compute @workgroup_size(WORKGROUP_SIZE)
fn cloud_reconstruct_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let size = textureDimensions(cloud_march_out);
    let i = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    if (i >= size.x * size.y) { return; }
    let g = vec3u(i % size.x, i / size.x, 0u);
    let q = g.xy;
    let blocks = textureDimensions(cloud_trace);
    let b = min(q / 2u, blocks - 1u);
    let own = min(cloud_block_distance(clouds.march.w, q), CLOUD_SKY_DISTANCE);
    // A superfície do texel mais perto que a casca: a marcha até ela não acha nuvem (o valor exato, sem histórico).
    if (own < cloud_shell_nearest(cameras[clouds.march.w].position.xyz)) {
        textureStore(cloud_march_out, q, vec4f(0.0, 0.0, 0.0, 1.0));
        textureStore(cloud_march_depth_out, q, vec4f(0.0, own, 0.0, 0.0));
        return;
    }
    // O valor exato da mesma superfície: o do bloco, ou o do vizinho marchado até a superfície mais parecida.
    var pick = b;
    var best = cloud_surface_differs(textureLoad(cloud_trace_depth, b, 0).g, own);
    if (best > CLOUD_SURFACE_AGREE) {
        for (var k = 0; k < 9; k++) {
            let nb = vec2u(clamp(vec2i(b) + vec2i(k % 3 - 1, k / 3 - 1), vec2i(0), vec2i(blocks) - 1));
            let r = cloud_surface_differs(textureLoad(cloud_trace_depth, nb, 0).g, own);
            if (r < best) {
                best = r;
                pick = nb;
            }
        }
    }
    let fresh = textureLoad(cloud_trace, pick, 0);
    let fresh_depth = textureLoad(cloud_trace_depth, pick, 0);
    let marched = b * 2u + cloud_bayer(clouds.march.z);
    let here = cloud_fresh_at(q, own, fresh);
    var out = here;
    var depth = fresh_depth.r;
    var limit = fresh_depth.g;
    let full = vec2f(size * cloud_march_scale());
    // O segundo momento temporal: o do valor exato do bloco sem histórico; com ele, a média exponencial (no pixel
    // marchado) ou o reprojetado (nos outros), mesmo quando o gradiente larga o histórico do valor — o ruído da amostra é
    // do pixel, não da mudança da nuvem.
    let lf = luminance(fresh.rgb);
    let fresh_m = vec2f(lf * lf, fresh.a * fresh.a);
    var moments = fresh_m;
    if (clouds.flags.x == 1u && cameras[clouds.march.w].history.x < 0.5) {
        let hh = cloud_history_at(q, full, own);
        let hist = hh.value;
        if (hist.a >= 0.0) {
            moments = select(hh.moments, mix(hh.moments, fresh_m, CLOUD_HISTORY_BLEND), all(q == marched));
        }
        // O histórico no pixel marchado do bloco (até a superfície guardada com o valor exato dele), do passe por bloco.
        let check = textureLoad(cloud_check, b, 0);
        // O gradiente temporal filtrado (Schied et al. 2018, A-SVGF): a divergência entre as médias ponderadas dos blocos
        // da janela do texel (`cloud_gradient_weight`) — o valor exato de cada um e o histórico reprojetado no pixel
        // marchado dele —, não a de uma amostra só: o ruído do deslocamento inicial da marcha numa amostra reprovava o
        // bloco na nuvem fina e na borda, e o bloco trocado pela amostra do pixel marchado puxava a borda para o vizinho
        // (smoke `clouds`: `noon` 7 %, `sunset` 9 %). Os blocos cujo histórico sai da tela ficam de fora da média; o ruído
        // esperado pelo número efetivo de amostras da média ponderada, `(Σw)²/Σw²`.
        var fresh_sum = vec4f(0.0);
        var check_sum = vec4f(0.0);
        // A dispersão dos valores exatos dos blocos (o brilho e a transmitância): o ruído de uma amostra.
        var fresh_sq = vec2f(0.0);
        // A soma das variâncias temporais de uma amostra nos pixels marchados (o brilho e a transmitância), × w².
        var temporal = vec2f(0.0);
        var wsum = 0.0;
        var w2sum = 0.0;
        let rel = vec2i(q) - vec2i(cloud_bayer(clouds.march.z));
        let b0 = vec2i(floor(vec2f(rel) * 0.5));
        let fr = vec2f(rel - 2 * b0) * 0.5;
        for (var k = 0; k < 16; k++) {
            let o = vec2i(k % 4 - 1, k / 4 - 1);
            let w = cloud_gradient_weight(o, fr);
            if (w <= 0.0) { continue; }
            let nb = vec2u(clamp(b0 + o, vec2i(0), vec2i(blocks) - 1));
            let h = textureLoad(cloud_check, nb, 0);
            if (h.a >= 0.0) {
                let v = textureLoad(cloud_trace, nb, 0);
                fresh_sum += v * w;
                check_sum += h * w;
                let lv = luminance(v.rgb);
                fresh_sq += vec2f(lv * lv, v.a * v.a) * w;
                temporal += textureLoad(cloud_check_noise, nb, 0).rg * (w * w);
                wsum += w;
                w2sum += w * w;
            }
        }
        let n = select(0.0, wsum * wsum / max(w2sum, 1e-9), wsum > 0.0);
        let fresh_mean = fresh_sum / max(wsum, 1e-9);
        let check_mean = check_sum / max(wsum, 1e-9);
        let st = sqrt(temporal) / max(wsum, 1e-9);
        // O erro padrão relativo da média do brilho na janela (de uma amostra por bloco).
        let relative = st.x / max(max(luminance(check_mean.rgb), luminance(fresh_mean.rgb)), 1e-4);
        let temporal_noise = CLOUD_TEMPORAL_NOISE * (0.5 * relative + st.y);
        let allowance = CLOUD_GRADIENT_TOLERANCE + cloud_gradient_noise(fresh_mean, fresh_sq / max(wsum, 1e-9), n)
            + temporal_noise;
        let reset = select(1.0, cloud_history_reset(cloud_divergence(check_mean, fresh_mean), allowance), n > 0.0);
        // O histórico segue o desvio medido (a mudança da luz que os três texels não marchados do bloco não viram).
        let follow = select(vec3f(1.0), cloud_history_follow(fresh_mean, check_mean, relative), n > 0.0);
        if (hist.a >= 0.0 && check.a >= 0.0) {
            let hist = vec4f(hist.rgb * follow, hist.a);
            limit = select(own, fresh_depth.g, reset >= 0.5);
            // O histórico recortado pela caixa dos valores exatos dos 3 × 3 blocos: com a câmera andando dentro da nuvem
            // (`voo` do claflow-web), a reprojeção pela profundidade da nuvem erra e, sem o recorte, o histórico velho
            // ficava em manchas de blocos.
            var lo = fresh;
            var hi = fresh;
            for (var k = 0; k < 9; k++) {
                let nb = vec2u(clamp(vec2i(b) + vec2i(k % 3 - 1, k / 3 - 1), vec2i(0), vec2i(blocks) - 1));
                let v = textureLoad(cloud_trace, nb, 0);
                lo = min(lo, v);
                hi = max(hi, v);
            }
            // A caixa com folga de metade da largura: uma amostra por bloco não cobre o detalhe fino (a faixa de 2–4 px
            // rente ao horizonte), que o recorte justo erodia (`sunset`, 5,8 %).
            let pad = CLOUD_BOX_PAD * (hi - lo);
            // O bloco que larga o histórico: o histórico recortado inteiro pela caixa (o que fica dele não sai dela) e o
            // valor exato interpolado no lugar do texel, na medida de `reset`.
            out = mix(hist, clamp(hist, lo - pad, hi + pad), max(cloud_reprojection_clip(q, full), reset));
            out = mix(out, here, reset);
            if (all(q == marched)) {
                out = mix(out, fresh, CLOUD_HISTORY_BLEND);
            } else if (reset < 0.5) {
                depth = textureLoad(cloud_march_depth_prev, q, 0).r;
            }
        }
    }
    textureStore(cloud_march_out, q, out);
    textureStore(cloud_march_depth_out, q, vec4f(depth, limit, moments));
}
