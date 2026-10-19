// Sombra (spec 005, R7; spec 034, L6): a visibilidade da luz direcional pelo mapa de sombra, com a penumbra da fonte de
// tamanho angular (PCSS). O sombreamento físico está nos módulos `bsdf`, `closure` e `closure_eval` (spec 011). Função
// pura: o mapa de sombra e o sampler entram como parâmetros.

/** Lado da grade da busca de quem faz sombra; amostras da filtragem (espiral de Vogel: sem fileiras alinhadas). */
const SHADOW_SEARCH_TAPS: i32 = 4;
const SHADOW_FILTER_TAPS: u32 = 32u;
/**
 * Raio máximo da filtragem em texels: 32 comparações bilineares num disco desse raio ficam a ~1,9 texel umas das
 * outras e não deixam bandas; penumbras maiores que isso (diâmetro de 12 texels) saem um pouco mais nítidas que a física.
 */
const SHADOW_MAX_RADIUS: f32 = 6.0;

// Visibilidade da luz direcional (1 = iluminado) na projeção ortográfica dela, com a penumbra de uma fonte de diâmetro
// angular `angular` (rad; 0 = ponto): (1) a profundidade média de quem faz sombra numa vizinhança do tamanho da maior
// penumbra possível (a distância até o começo do mapa vezes o diâmetro); (2) a penumbra = a distância de quem faz
// sombra até o ponto vezes o diâmetro; (3) a média das comparações bilineares num disco desse raio (no mínimo 1 texel,
// o antisserrilhado da borda dura). Os vieses em texels do mapa, convertidos para mundo pela própria matriz (a escala de
// x em NDC por metro e a de z): a consulta sai do ponto pela normal da superfície `normal` (0 num volume)
// `normal_texels` texels, mais quanto mais rasante a luz `light_dir` (unitária, do ponto para a luz), e compara com
// `bias_texels` texels de profundidade. Fora do frustum da luz ou com a sombra desligada (`enabled` < 0.5) devolve 1.
fn sample_shadow_pcss(
    shadow_map: texture_depth_2d,
    shadow_sampler: sampler_comparison,
    light_view_proj: mat4x4f,
    world_pos: vec3f,
    normal: vec3f,
    light_dir: vec3f,
    bias_texels: f32,
    normal_texels: f32,
    enabled: f32,
    angular: f32,
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
    let uv = vec2<f32>(ndc.x * 0.5 + 0.5, 0.5 - ndc.y * 0.5);
    let ref_depth = ndc.z - bias_texels * texel_world * per_metre_z;
    let in_bounds = ndc.x >= -1.0 && ndc.x <= 1.0 && ndc.y >= -1.0 && ndc.y <= 1.0 && ndc.z >= 0.0 && ndc.z <= 1.0;
    if (enabled < 0.5 || !in_bounds) { return 1.0; }
    let texel = vec2<f32>(1.0) / size;
    let metres_per_depth = 1.0 / max(per_metre_z, 1e-6);
    // (1) Quem faz sombra: a profundidade crua (sem comparação) numa grade 4 × 4.
    let search = clamp(angular * ref_depth * metres_per_depth / texel_world, 1.0, SHADOW_MAX_RADIUS);
    var blockers = 0.0;
    var blocker_depth = 0.0;
    let dims = vec2<i32>(size);
    for (var j: i32 = 0; j < SHADOW_SEARCH_TAPS; j++) {
        for (var i: i32 = 0; i < SHADOW_SEARCH_TAPS; i++) {
            let o = (vec2<f32>(f32(i), f32(j)) + 0.5) / f32(SHADOW_SEARCH_TAPS) * 2.0 - 1.0;
            let t = clamp(vec2<i32>(floor((uv + o * search * texel) * size)), vec2<i32>(0), dims - 1);
            let d = textureLoad(shadow_map, t, 0);
            if (d < ref_depth) {
                blockers += 1.0;
                blocker_depth += d;
            }
        }
    }
    if (blockers == 0.0) { return 1.0; }
    // (2) A penumbra pela distância de quem faz sombra até o ponto (raio = metade do diâmetro).
    let distance = (ref_depth - blocker_depth / blockers) * metres_per_depth;
    let radius = clamp(0.5 * angular * distance / texel_world, 1.0, SHADOW_MAX_RADIUS);
    // (3) As comparações bilineares numa espiral de Vogel do raio (área igual por amostra).
    var sum = 0.0;
    for (var k = 0u; k < SHADOW_FILTER_TAPS; k++) {
        let rho = sqrt((f32(k) + 0.5) / f32(SHADOW_FILTER_TAPS));
        let theta = f32(k) * 2.39996323;
        let o = rho * vec2<f32>(cos(theta), sin(theta));
        sum += textureSampleCompareLevel(shadow_map, shadow_sampler, uv + o * radius * texel, ref_depth);
    }
    return sum / f32(SHADOW_FILTER_TAPS);
}
