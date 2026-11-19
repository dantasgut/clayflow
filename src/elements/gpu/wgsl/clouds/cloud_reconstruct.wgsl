// Reconstrução temporal das nuvens (spec 041, R2): o alvo reconstruído (¼ da tela; 1/16 no perfil baixo), série temporal da 037 (`march` e `marchDepth`,
// lidas pelo atraso 1). Os pixels do bloco vêm do histórico reprojetado pela posição da nuvem (a câmera atual e a
// profundidade da nuvem do quadro anterior) e pelo vento (onde a nuvem estava: o ponto menos o vento × Δt); o pixel
// marchado mistura o valor exato a ele (média exponencial). O gradiente temporal da 034, filtrado nos 3 × 3 blocos em
// volta, decide a validade: se a média dos históricos reprojetados nos pixels marchados diverge da média dos valores
// exatos além da tolerância, os quatro do bloco largam o histórico (o valor do bloco). O recorte do histórico pela caixa
// dos valores exatos dos 3 × 3 blocos só onde a reprojeção é incerta: a profundidade da nuvem é a média de um trecho, e
// a câmera que anda (o `voo`) leva o histórico de outro lugar; parada ou girando, a reprojeção não depende da
// profundidade e o histórico é exato — a caixa tem uma amostra por bloco, e o detalhe claro menor que o bloco (a borda
// prateada das nuvens a 50–100 km perto do sol baixo, a faixa rente ao horizonte) ficava fora dela em quase todo quadro e
// era recortado (`sunset`: −35 % de luz nas linhas junto ao sol). Sem histórico válido (corte, recriação, primeiro
// quadro), o valor do bloco.
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
// cloud_march_depth_prev, cloud_march_out, cloud_march_depth_out.

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
 * Onde o ponto do pixel `q` (¼ da tela) à distância `d` (m) estava no quadro anterior (normalizado na tela; z = 1 se dentro
 * dela): a câmera atual e o vento (o ponto menos o vento × Δt).
 */
fn cloud_previous_uv(q: vec2u, full: vec2f, d: f32) -> vec3f {
    let slot = clouds.march.w;
    let ray = camera_ray(slot, (vec2f(q) + 0.5) * f32(cloud_march_scale()), full);
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

/**
 * O histórico no pixel `q` (¼ da tela) reprojetado, só dos texels marchados até a superfície `surface` (m): a leitura
 * bilinear dos quatro vizinhos, cada um pesado pela concordância da superfície guardada com ele (com a câmera andando, a
 * leitura na silhueta do chão contra o céu misturava o valor de um ao outro); `a` < 0 quando sai da tela ou nenhum dos
 * quatro é da mesma superfície.
 */
fn cloud_history_at(q: vec2u, full: vec2f, surface: f32) -> vec4f {
    let prev = cloud_previous_uv(q, full, cloud_history_depth(q));
    if (prev.z < 0.5) { return vec4f(0.0, 0.0, 0.0, -1.0); }
    let uv = prev.xy;
    let dims = vec2i(textureDimensions(cloud_march_prev));
    let p = uv * vec2f(dims) - 0.5;
    let base = vec2i(floor(p));
    let f = p - floor(p);
    var sum = vec4f(0.0);
    var weight = 0.0;
    for (var k = 0; k < 4; k++) {
        let o = vec2i(k & 1, k >> 1);
        let t = clamp(base + o, vec2i(0), dims - 1);
        let bil = select(1.0 - f.x, f.x, o.x == 1) * select(1.0 - f.y, f.y, o.y == 1);
        let same = cloud_surface_differs(textureLoad(cloud_march_depth_prev, t, 0).g, surface) <= CLOUD_SURFACE_AGREE;
        let w = select(0.0, bil, same);
        sum += textureLoad(cloud_march_prev, t, 0) * w;
        weight += w;
    }
    if (weight < 1e-3) { return vec4f(0.0, 0.0, 0.0, -1.0); }
    return sum / weight;
}

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
    var out = fresh;
    var depth = fresh_depth.r;
    var limit = fresh_depth.g;
    let full = vec2f(size * cloud_march_scale());
    if (clouds.flags.x == 1u && cameras[clouds.march.w].history.x < 0.5) {
        let hist = cloud_history_at(q, full, own);
        // O pixel marchado do bloco foi marchado até a superfície guardada com o valor exato do bloco.
        let check = cloud_history_at(min(marched, size - 1u), full, textureLoad(cloud_trace_depth, b, 0).g);
        // O gradiente temporal filtrado (Schied et al. 2018, A-SVGF): a divergência entre as médias dos 3 × 3 blocos em
        // volta — o valor exato de cada um e o histórico reprojetado no pixel marchado dele —, não a de uma amostra só:
        // o ruído do deslocamento inicial da marcha numa amostra reprovava o bloco na nuvem fina e na borda, e o bloco
        // trocado pela amostra do pixel marchado puxava a borda para o vizinho (smoke `clouds`: `noon` 7 %, `sunset` 9 %).
        // Os vizinhos cujo histórico sai da tela ficam de fora da média.
        var fresh_sum = vec4f(0.0);
        var check_sum = vec4f(0.0);
        // A dispersão dos valores exatos dos blocos (o brilho e a transmitância): o ruído de uma amostra.
        var fresh_sq = vec2f(0.0);
        var n = 0.0;
        for (var k = 0; k < 9; k++) {
            let nb = vec2u(clamp(vec2i(b) + vec2i(k % 3 - 1, k / 3 - 1), vec2i(0), vec2i(blocks) - 1));
            let h = cloud_history_at(
                min(nb * 2u + cloud_bayer(clouds.march.z), size - 1u),
                full,
                textureLoad(cloud_trace_depth, nb, 0).g,
            );
            if (h.a >= 0.0) {
                let v = textureLoad(cloud_trace, nb, 0);
                fresh_sum += v;
                check_sum += h;
                let lv = luminance(v.rgb);
                fresh_sq += vec2f(lv * lv, v.a * v.a);
                n += 1.0;
            }
        }
        let fresh_mean = fresh_sum / max(n, 1.0);
        let agrees = n > 0.0
            && cloud_divergence(check_sum / max(n, 1.0), fresh_mean)
                <= CLOUD_GRADIENT_TOLERANCE + cloud_gradient_noise(fresh_mean, fresh_sq / max(n, 1.0), n);
        if (hist.a >= 0.0 && check.a >= 0.0 && agrees) {
            limit = own;
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
            out = mix(hist, clamp(hist, lo - pad, hi + pad), cloud_reprojection_clip(q, full));
            if (all(q == marched)) {
                out = mix(out, fresh, CLOUD_HISTORY_BLEND);
            } else {
                depth = textureLoad(cloud_march_depth_prev, q, 0).r;
            }
        }
    }
    textureStore(cloud_march_out, q, out);
    textureStore(cloud_march_depth_out, q, vec4f(depth, limit, 0.0, 0.0));
}
