// A média no tempo da sombra das luzes de área (spec 013, R5; os canais temporais da spec 037): o ponto de mundo de cada
// texel volta à tela do quadro anterior (a vista-projeção de antes), e a média de lá (os quatro texels em volta, só os
// do mesmo ponto) é misturada com o traçado do quadro. A média de antes é levada à faixa do que os vizinhos traçaram
// agora: com a luz ou o que a tapa em movimento, ela acompanha em vez de ficar para trás.
// Requer: view_space, cameras, asp; as_traced, as_point, as_accumulated_prev, as_history_prev (leitura);
// as_accumulated_out, as_history_out (escrita).

@compute @workgroup_size(8, 8)
fn area_shadow_temporal_main(@builtin(global_invocation_id) gid: vec3u) {
    let dim = vec2i(textureDimensions(as_traced));
    if (i32(gid.x) >= dim.x || i32(gid.y) >= dim.y) { return; }
    let q = vec2i(gid.xy);
    let point = textureLoad(as_point, q, 0);
    if (point.w <= 0.0) {
        textureStore(as_accumulated_out, q, vec4f(1.0));
        textureStore(as_history_out, q, vec4f(0.0));
        return;
    }
    let cam = cameras[asp.cameraSlot];
    let p = point.xyz;
    let far = distance(p, cam.position.xyz);
    let near = 0.02 * far + 1.0e-4;
    let traced = textureLoad(as_traced, q, 0);
    // O que os vizinhos (5 × 5, da mesma superfície) traçaram agora: a média e o desvio.
    var m1 = vec4f(0.0);
    var m2 = vec4f(0.0);
    var count = 0.0;
    for (var dy = -2; dy <= 2; dy++) {
        for (var dx = -2; dx <= 2; dx++) {
            let t = clamp(q + vec2i(dx, dy), vec2i(0), dim - 1);
            let tp = textureLoad(as_point, t, 0);
            if (tp.w <= 0.0 || distance(tp.xyz, p) > 8.0 * near) { continue; }
            let v = textureLoad(as_traced, t, 0);
            m1 += v;
            m2 += v * v;
            count += 1.0;
        }
    }
    let mean = m1 / max(count, 1.0);
    let sigma = sqrt(max(m2 / max(count, 1.0) - mean * mean, vec4f(0.0)));
    // O histórico pelo ponto de mundo, na tela do quadro anterior.
    var past = vec4f(0.0);
    var frames = 0.0;
    var weight = 0.0;
    let clip = cam.previousViewProjection * vec4f(p, 1.0);
    if (clip.w > 0.0) {
        let x = ndc_to_uv(clip.xy / clip.w) * vec2f(dim) - 0.5;
        let base = floor(x);
        let f = x - base;
        for (var k = 0u; k < 4u; k++) {
            let o = vec2i(i32(k & 1u), i32(k >> 1u));
            let t = vec2i(base) + o;
            if (any(t < vec2i(0)) || any(t >= dim)) { continue; }
            let h = textureLoad(as_history_prev, t, 0);
            if (h.w <= 0.0 || distance(h.xyz, p) > near) { continue; }
            let w2 = mix(vec2f(1.0) - f, f, vec2f(o));
            let w = w2.x * w2.y;
            past += w * textureLoad(as_accumulated_prev, t, 0);
            frames += w * h.w;
            weight += w;
        }
    }
    var value = mean;
    var age = 1.0;
    if (weight > 1.0e-3) {
        past /= weight;
        frames /= weight;
        let band = 2.0 * sigma / sqrt(max(count, 1.0)) + vec4f(0.03);
        let kept = clamp(past, mean - band, mean + band);
        // Os quadros da média por luz: a que mudou de lugar ou de tamanho há pouco fica com poucos (o histórico dela
        // não vale mais em lugar nenhum).
        let most = max(asp.history, vec4f(1.0));
        let alpha = max(vec4f(1.0 / (frames + 1.0)), vec4f(1.0) / most);
        value = mix(kept, traced, alpha);
        age = min(frames + 1.0, max(max(most.x, most.y), max(most.z, most.w)));
    }
    textureStore(as_accumulated_out, q, value);
    textureStore(as_history_out, q, vec4f(p, age));
}
