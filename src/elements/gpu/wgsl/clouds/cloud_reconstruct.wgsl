// Reconstrução temporal das nuvens (spec 041, R2): o alvo reconstruído (¼ da tela; 1/16 no perfil baixo), série temporal da 037 (`march` e `marchDepth`,
// lidas pelo atraso 1). Os pixels do bloco vêm do histórico reprojetado pela posição da nuvem (a câmera atual e a
// profundidade da nuvem do quadro anterior) e pelo vento (onde a nuvem estava: o ponto menos o vento × Δt); o pixel
// marchado mistura o valor exato a ele (média exponencial). O gradiente temporal da 034, filtrado nos 3 × 3 blocos em
// volta, decide a validade: se a média dos históricos reprojetados nos pixels marchados diverge da média dos valores
// exatos além da tolerância, os quatro do bloco largam o histórico (o valor do bloco). Sem recorte do histórico pela
// caixa da vizinhança: ela tem uma amostra por bloco, e o detalhe fino fora dela seria recortado em três de cada quatro
// quadros (como a Unreal, que deixa o recorte da reprojeção desligado por padrão). Sem histórico válido (corte,
// recriação, primeiro quadro), o valor do bloco.
// A superfície (spec 041): cada texel marcha até a superfície mais próxima dos pixels da tela dele, e o valor guarda até
// onde foi (`cloud_march_depth_out.g`). O histórico é lido só dos texels marchados até a mesma superfície de agora, e o valor do bloco
// é o do pixel marchado dele só se este for da mesma superfície; senão, o do bloco vizinho (3 × 3) mais parecido. Na borda
// do chão contra o céu, o texel do chão recebia o valor do pixel marchado no céu (a nuvem rente ao horizonte) e o do céu
// o do chão (sem nuvem): com o deslocamento da amostra mudando a superfície dos pixels a cada quadro, o horizonte tremia em
// blocos.
// Espelho de `reference/cloudReconstruct.ts`.
// Despacho linear: um texel por invocação.
// Requer: WORKGROUP_SIZE, color, cloud_march_bayer, cloud_scene_limit, cloud_scene_depth, camera_space, clouds, cameras,
// cloud_trace, cloud_trace_depth, cloud_march_prev,
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
 * O histórico no pixel `q` (¼ da tela) reprojetado, só dos texels marchados até a superfície `surface` (m): a leitura
 * bilinear dos quatro vizinhos, cada um pesado pela concordância da superfície guardada com ele (com a câmera andando, a
 * leitura na silhueta do chão contra o céu misturava o valor de um ao outro); `a` < 0 quando sai da tela ou nenhum dos
 * quatro é da mesma superfície.
 */
fn cloud_history_at(q: vec2u, full: vec2f, surface: f32) -> vec4f {
    let slot = clouds.march.w;
    let cam = cameras[slot];
    let prev_depth = textureLoad(cloud_march_depth_prev, q, 0).r;
    let ray = camera_ray(slot, (vec2f(q) + 0.5) * f32(cloud_march_scale()), full);
    let d = select(1e7, prev_depth, prev_depth > 0.0);
    let world = ray.origin + ray.dir * d;
    let before = world - vec3f(clouds.wind.z, 0.0, clouds.wind.w) * clouds.timing.x;
    let clip = cam.previousViewProjection * vec4f(before, 1.0);
    if (clip.w <= 0.0) { return vec4f(0.0, 0.0, 0.0, -1.0); }
    let uv = ndc_to_uv(clip.xy / clip.w);
    if (any(uv < vec2f(0.0)) || any(uv > vec2f(1.0))) { return vec4f(0.0, 0.0, 0.0, -1.0); }
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
        var n = 0.0;
        for (var k = 0; k < 9; k++) {
            let nb = vec2u(clamp(vec2i(b) + vec2i(k % 3 - 1, k / 3 - 1), vec2i(0), vec2i(blocks) - 1));
            let h = cloud_history_at(
                min(nb * 2u + cloud_bayer(clouds.march.z), size - 1u),
                full,
                textureLoad(cloud_trace_depth, nb, 0).g,
            );
            if (h.a >= 0.0) {
                fresh_sum += textureLoad(cloud_trace, nb, 0);
                check_sum += h;
                n += 1.0;
            }
        }
        let agrees = n > 0.0 && cloud_divergence(check_sum / max(n, 1.0), fresh_sum / max(n, 1.0)) <= CLOUD_GRADIENT_TOLERANCE;
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
            out = clamp(hist, lo - pad, hi + pad);
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
