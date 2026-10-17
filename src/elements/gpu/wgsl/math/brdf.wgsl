// Sombra (spec 005, R7): a visibilidade da luz por PCF 3×3 no mapa de sombra. O sombreamento físico está nos módulos
// `bsdf`, `closure` e `closure_eval` (spec 011). Função pura: o mapa de sombra e o sampler entram como parâmetros.

// Visibilidade da luz por PCF 3×3 no mapa de sombra (1 = iluminado). Viés inclinado pelo ângulo com a luz; fora do
// frustum da luz ou com a sombra desligada (`enabled` < 0.5) devolve 1. Sem desvio de fluxo dependente de dados.
fn sample_shadow_pcf(
    shadow_map: texture_depth_2d,
    shadow_sampler: sampler_comparison,
    light_view_proj: mat4x4f,
    world_pos: vec3f,
    bias_base: f32,
    enabled: f32,
    n_dot_l: f32,
) -> f32 {
    let lp = light_view_proj * vec4<f32>(world_pos, 1.0);
    let ndc = lp.xyz / max(lp.w, 1e-6);
    let uv = vec2<f32>(ndc.x * 0.5 + 0.5, 0.5 - ndc.y * 0.5);
    let bias = max(bias_base * (1.0 - n_dot_l), bias_base * 0.1);
    let ref_depth = ndc.z - bias;
    let texel = vec2<f32>(1.0) / vec2<f32>(textureDimensions(shadow_map, 0));
    var sum = 0.0;
    for (var dy: i32 = -1; dy <= 1; dy = dy + 1) {
        for (var dx: i32 = -1; dx <= 1; dx = dx + 1) {
            sum = sum + textureSampleCompareLevel(
                shadow_map, shadow_sampler,
                uv + vec2<f32>(f32(dx), f32(dy)) * texel,
                ref_depth,
            );
        }
    }
    let pcf = sum / 9.0;
    let in_bounds = f32(ndc.x >= -1.0 && ndc.x <= 1.0 && ndc.y >= -1.0 && ndc.y <= 1.0 && ndc.z >= 0.0 && ndc.z <= 1.0);
    return mix(1.0, mix(1.0, pcf, in_bounds), step(0.5, enabled));
}
