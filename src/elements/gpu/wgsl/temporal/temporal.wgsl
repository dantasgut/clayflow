// Peças temporais (spec 037, R5): o que os acumuladores temporais (antisserrilhado, sondas de tela da luz global, névoa,
// filtro do sinal traçado) têm em comum — a reprojeção de um ponto, a validação do histórico, as políticas de peso, os
// momentos e o corte de câmera. Cada acumulador compõe as peças no próprio domínio (pixel, sonda, froxel). Sem
// recursos. Referência f64: `elements/math/reference/temporal.ts`.
// Requer: view_space.

// Onde o ponto de mundo `p` estava na tela do quadro anterior (`previous_view_projection`, sem deslocamento da
// amostra): uv em xy; z = 1 se ele estava à frente da câmera e dentro da tela, senão 0.
fn temporal_reproject_point(previous_view_projection: mat4x4f, p: vec3f) -> vec3f {
    let clip = previous_view_projection * vec4f(p, 1.0);
    if (clip.w <= 0.0) { return vec3f(0.0); }
    let ndc = clip.xy / clip.w;
    if (any(abs(ndc) > vec2f(1.0))) { return vec3f(0.0); }
    return vec3f(ndc_to_uv(ndc), 1.0);
}

// O quadro não continua o anterior (o `history` das `CameraMatrices`: primeiro quadro ou corte)?
fn temporal_cut(history: vec4f) -> bool {
    return history.x != 0.0;
}

// Validação por objeto: o histórico mostrava o mesmo objeto (`id`) a até `gap` larguras de pixel (`footprint`, no
// ponto) do ponto de agora levado ao quadro anterior.
fn temporal_validate_object(previous_id: u32, id: u32, shown: vec3f, before: vec3f, footprint: f32, gap: f32) -> bool {
    return previous_id == id && length(shown - before) <= gap * footprint;
}

// Validação por plano e normal: o peso (0–1) do histórico no ponto `previous` de normal `previous_normal` para o ponto
// `p` de normal `n` — zero se as normais se afastam além de `min_cos`, caindo com a distância ao plano até
// `tolerance`.
fn temporal_validate_plane(previous: vec3f, previous_normal: vec3f, p: vec3f, n: vec3f, tolerance: f32, min_cos: f32) -> f32 {
    if (dot(previous_normal, n) < min_cos) { return 0.0; }
    return max(0.0, 1.0 - abs(dot(p - previous, n)) / tolerance);
}

// Peso da amostra nova por contagem: 1/(quadros + 1), com o histórico limitado a `max_frames` quadros.
fn temporal_weight_count(frames: f32, max_frames: f32) -> f32 {
    return 1.0 / min(frames + 1.0, max_frames);
}

// O α do A-SVGF: do peso por contagem a 1 com a mudança da cena (0–1) — onde algo mudou, o histórico some.
fn temporal_weight_change(weight: f32, change: f32) -> f32 {
    return mix(weight, 1.0, change);
}

// Histerese fixa: o histórico pesa `hysteresis` (0–1) contra a amostra nova.
fn temporal_hysteresis(current: vec4f, history: vec4f, hysteresis: f32) -> vec4f {
    return mix(current, history, hysteresis);
}

// Momentos (média e média do quadrado) da luminância `l` sobre o histórico, com o peso da amostra nova no mínimo
// `min_alpha` (a variância acompanha a cena mais depressa que a cor).
fn temporal_moments(previous: vec2f, l: f32, alpha: f32, min_alpha: f32) -> vec2f {
    return mix(previous, vec2f(l, l * l), max(alpha, min_alpha));
}

// A variância das amostras a partir dos momentos.
fn temporal_variance(moments: vec2f) -> f32 {
    return max(moments.y - moments.x * moments.x, 0.0);
}

// A variância da média de `frames` quadros (SVGF: multiplicada por 4/quadros com menos de 4, onde a estimativa é
// pobre).
fn temporal_mean_variance(variance: f32, frames: f32) -> f32 {
    return variance * max(4.0 / frames, 1.0) / frames;
}
