// Reconstrução temporal das nuvens (spec 041, R2): o alvo de ¼ da tela, série temporal da 037 (`march` e `marchDepth`,
// lidas pelo atraso 1). O pixel marchado do bloco entra exato; os outros três vêm do histórico reprojetado pela posição
// da nuvem (a câmera atual e a profundidade da nuvem do quadro anterior) e pelo vento (onde a nuvem estava: o ponto
// menos o vento × Δt), recortado pela caixa dos pixels marchados nos 3 × 3 blocos em volta; e o gradiente temporal da
// 034: se no pixel marchado o histórico reprojetado diverge do valor exato além da tolerância, os três do bloco largam
// o histórico (o valor do bloco). Sem histórico válido (corte, recriação, primeiro quadro), o valor do bloco.
// Espelho de `reference/cloudReconstruct.ts`.
// Despacho linear: um texel por invocação.
// Requer: WORKGROUP_SIZE, color, cloud_march_bayer, camera_space, clouds, cameras, cloud_trace, cloud_trace_depth, cloud_march_prev,
// cloud_march_depth_prev, cloud_clamp_sampler, cloud_march_out, cloud_march_depth_out.

/** Tolerância do gradiente temporal: diferença relativa da luz mais a da transmitância. */
const CLOUD_GRADIENT_TOLERANCE: f32 = 0.2;
/**
 * Peso do valor novo no pixel marchado (média exponencial sobre o histórico recortado): a amostra de um deslocamento
 * inicial aleatório entra aos poucos, e o ruído do deslocamento não cintila a cada vez que o bloco é marchado.
 */
const CLOUD_HISTORY_BLEND: f32 = 0.25;

/** O histórico no pixel `q` (¼ da tela) reprojetado; `a` < 0 quando sai da tela. */
fn cloud_history_at(q: vec2u, full: vec2f) -> vec4f {
    let slot = clouds.march.w;
    let cam = cameras[slot];
    let prev_depth = textureLoad(cloud_march_depth_prev, q, 0).r;
    let ray = camera_ray(slot, vec2f(q) * 2.0 + 1.0, full);
    let d = select(1e7, prev_depth, prev_depth > 0.0);
    let world = ray.origin + ray.dir * d;
    let before = world - vec3f(clouds.wind.z, 0.0, clouds.wind.w) * clouds.timing.x;
    let clip = cam.previousViewProjection * vec4f(before, 1.0);
    if (clip.w <= 0.0) { return vec4f(0.0, 0.0, 0.0, -1.0); }
    let uv = ndc_to_uv(clip.xy / clip.w);
    if (any(uv < vec2f(0.0)) || any(uv > vec2f(1.0))) { return vec4f(0.0, 0.0, 0.0, -1.0); }
    return textureSampleLevel(cloud_march_prev, cloud_clamp_sampler, uv, 0.0);
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
    let fresh = textureLoad(cloud_trace, b, 0);
    let fresh_depth = textureLoad(cloud_trace_depth, b, 0).r;
    let marched = b * 2u + cloud_bayer(clouds.march.z);
    var out = fresh;
    var depth = fresh_depth;
    let full = vec2f(size * 2u);
    if (clouds.flags.x == 1u && cameras[clouds.march.w].history.x < 0.5) {
        let hist = cloud_history_at(q, full);
        let check = cloud_history_at(min(marched, size - 1u), full);
        if (hist.a >= 0.0 && check.a >= 0.0 && cloud_divergence(check, fresh) <= CLOUD_GRADIENT_TOLERANCE) {
            var lo = fresh;
            var hi = fresh;
            for (var k = 0; k < 9; k++) {
                let o = vec2i(k % 3 - 1, k / 3 - 1);
                let n = textureLoad(cloud_trace, vec2u(clamp(vec2i(b) + o, vec2i(0), vec2i(blocks) - 1)), 0);
                lo = min(lo, n);
                hi = max(hi, n);
            }
            out = clamp(hist, lo, hi);
            if (all(q == marched)) {
                out = mix(out, fresh, CLOUD_HISTORY_BLEND);
            } else {
                depth = textureLoad(cloud_march_depth_prev, q, 0).r;
            }
        }
    }
    textureStore(cloud_march_out, q, out);
    textureStore(cloud_march_depth_out, q, vec4f(depth, 0.0, 0.0, 0.0));
}
