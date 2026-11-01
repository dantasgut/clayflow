// Sombra (spec 005, R7): a visibilidade da luz por PCF (até 3×3) no mapa de sombra. O sombreamento físico está nos módulos
// `bsdf`, `closure` e `closure_eval` (spec 011). Função pura: o mapa de sombra e o sampler entram como parâmetros.

// Visibilidade da luz por PCF no mapa de sombra (1 = iluminado), para a projeção ortográfica da luz direcional, com
// `samples` amostras da penumbra (1, 4 ou 9: grade 1×1, 2×2 ou 3×3 centrada no ponto; o perfil do `Renderer`, T079).
// Os vieses em texels do mapa, convertidos para mundo pela própria matriz (a escala de x em NDC por metro e a de z):
// a consulta sai do ponto pela normal da superfície `normal` (0 num volume) `normal_texels` texels, mais quanto mais
// rasante a luz `light_dir` (unitária, do ponto para a luz) — os vizinhos do PCF ficam acima da superfície — e compara
// com `bias_texels` texels de profundidade. Pequenos assim, nenhum ponto atrás de quem faz sombra (um canto, a junta
// de duas placas) passa por iluminado. O padrão gira em torno do ponto por `rotation` (cosseno, seno; spec 034: a
// sequência do deslocamento da amostra muda o ângulo a cada quadro e o acúmulo temporal faz a média — o núcleo fica
// redondo e a borda sem o degrau da grade; (1, 0) é a grade alinhada aos texels). Fora do frustum da luz ou com a sombra
// desligada (`enabled` < 0.5) devolve 1. Sem desvio de fluxo dependente de dados.
fn sample_shadow_pcf(
    shadow_map: texture_depth_2d,
    shadow_sampler: sampler_comparison,
    light_view_proj: mat4x4f,
    world_pos: vec3f,
    normal: vec3f,
    light_dir: vec3f,
    bias_texels: f32,
    normal_texels: f32,
    rotation: vec2f,
    samples: u32,
    enabled: f32,
) -> f32 {
    let size = vec2<f32>(textureDimensions(shadow_map, 0));
    let per_metre_x = length(vec3<f32>(light_view_proj[0][0], light_view_proj[1][0], light_view_proj[2][0]));
    let per_metre_z = length(vec3<f32>(light_view_proj[0][2], light_view_proj[1][2], light_view_proj[2][2]));
    let texel_world = 2.0 / max(per_metre_x * size.x, 1e-6);
    let n_dot_l = clamp(dot(normal, light_dir), 0.0, 1.0);
    let sin_l = sqrt(max(1.0 - n_dot_l * n_dot_l, 0.0));
    let offset = normal * (normal_texels * texel_world * (0.5 + sin_l));
    let lp = light_view_proj * vec4<f32>(world_pos + offset, 1.0);
    let ndc = lp.xyz / max(lp.w, 1e-6);
    let uv = ndc_to_uv(ndc.xy);
    let ref_depth = ndc.z - bias_texels * texel_world * per_metre_z;
    let texel = vec2<f32>(1.0) / size;
    let turn = mat2x2<f32>(rotation.x, rotation.y, -rotation.y, rotation.x);
    // Lado da grade (1, 2 ou 3) e o centro dela: com 3, os deslocamentos -1, 0 e 1 (a grade de antes, na mesma ordem).
    let side = select(select(1u, 2u, samples >= 4u), 3u, samples >= 9u);
    let half = 0.5 * f32(side - 1u);
    var sum = 0.0;
    for (var iy = 0u; iy < 3u; iy = iy + 1u) {
        if (iy >= side) { break; }
        for (var ix = 0u; ix < 3u; ix = ix + 1u) {
            if (ix >= side) { break; }
            sum = sum + textureSampleCompareLevel(
                shadow_map, shadow_sampler,
                uv + turn * (vec2<f32>(f32(ix), f32(iy)) - half) * texel,
                ref_depth,
            );
        }
    }
    let pcf = sum / f32(side * side);
    let in_bounds = f32(ndc.x >= -1.0 && ndc.x <= 1.0 && ndc.y >= -1.0 && ndc.y <= 1.0 && ndc.z >= 0.0 && ndc.z <= 1.0);
    return mix(1.0, mix(1.0, pcf, in_bounds), step(0.5, enabled));
}
