// A cópia da cena lida no traçado da refração (spec 034, R1): lisa (Catmull-Rom, sem os blocos dos texels) onde a
// superfície vista pelo raio aparece na tela, no limite de interfaces. (Ler a cópia também onde ela bastaria — a
// superfície visível nela, sem ampliar — foi medido: 0,2 ms a menos na água e erro nas bordas de alto contraste, onde a
// cópia interpola o padrão já amostrado da cena; o segundo kernel calcula sempre a luz.)
// Requer: scene_copy, scene_copy_sampler, CameraMatrices (struct).

/**
 * Catmull-Rom em 9 leituras bilineares: a cópia da cena lisa (sem os blocos dos texels) e interpolando os texels (a
 * B-spline borrava: tirava contraste das bordas que a cópia já tem nítidas), limitada aos texels vizinhos.
 */
fn refraction_bicubic(uv: vec2f) -> vec3f {
    let size = vec2f(textureDimensions(scene_copy, 0));
    let sample = uv * size;
    let t1 = floor(sample - 0.5) + 0.5;
    let f = sample - t1;
    let w0 = f * (-0.5 + f * (1.0 - 0.5 * f));
    let w1 = 1.0 + f * f * (-2.5 + 1.5 * f);
    let w2 = f * (0.5 + f * (2.0 - 1.5 * f));
    let w3 = f * f * (-0.5 + 0.5 * f);
    let w12 = w1 + w2;
    let t0 = (t1 - 1.0) / size;
    let t3 = (t1 + 2.0) / size;
    let t12 = (t1 + w2 / w12) / size;
    var c = vec3f(0.0);
    c += textureSampleLevel(scene_copy, scene_copy_sampler, vec2f(t0.x, t0.y), 0.0).rgb * w0.x * w0.y;
    c += textureSampleLevel(scene_copy, scene_copy_sampler, vec2f(t12.x, t0.y), 0.0).rgb * w12.x * w0.y;
    c += textureSampleLevel(scene_copy, scene_copy_sampler, vec2f(t3.x, t0.y), 0.0).rgb * w3.x * w0.y;
    c += textureSampleLevel(scene_copy, scene_copy_sampler, vec2f(t0.x, t12.y), 0.0).rgb * w0.x * w12.y;
    c += textureSampleLevel(scene_copy, scene_copy_sampler, vec2f(t12.x, t12.y), 0.0).rgb * w12.x * w12.y;
    c += textureSampleLevel(scene_copy, scene_copy_sampler, vec2f(t3.x, t12.y), 0.0).rgb * w3.x * w12.y;
    c += textureSampleLevel(scene_copy, scene_copy_sampler, vec2f(t0.x, t3.y), 0.0).rgb * w0.x * w3.y;
    c += textureSampleLevel(scene_copy, scene_copy_sampler, vec2f(t12.x, t3.y), 0.0).rgb * w12.x * w3.y;
    c += textureSampleLevel(scene_copy, scene_copy_sampler, vec2f(t3.x, t3.y), 0.0).rgb * w3.x * w3.y;
    // Sem o excesso da Catmull-Rom nas bordas de alto contraste (em HDR, contornos escuros e halos): o resultado no
    // intervalo dos 4 texels vizinhos.
    let base = vec2i(t1 - 0.5);
    let limit = vec2i(size) - vec2i(1);
    let a = textureLoad(scene_copy, clamp(base, vec2i(0), limit), 0).rgb;
    let b = textureLoad(scene_copy, clamp(base + vec2i(1, 0), vec2i(0), limit), 0).rgb;
    let d = textureLoad(scene_copy, clamp(base + vec2i(0, 1), vec2i(0), limit), 0).rgb;
    let e = textureLoad(scene_copy, clamp(base + vec2i(1, 1), vec2i(0), limit), 0).rgb;
    return clamp(c, min(min(a, b), min(d, e)), max(max(a, b), max(d, e)));
}

/** O ponto `p` na cópia da cena (uv; fora da tela devolve -1). */
fn refraction_screen_uv(cam: CameraMatrices, p: vec3f) -> vec2f {
    let clip = cam.viewProjection * vec4f(p, 1.0);
    if (clip.w <= 1e-6) { return vec2f(-1.0); }
    let ndc = clip.xy / clip.w;
    return vec2f(ndc.x * 0.5 + 0.5, 0.5 - ndc.y * 0.5);
}
