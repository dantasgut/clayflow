// Passadas à-trous do filtro de sinal traçado (spec 034, R3, T044a; o SVGF de Schied et al. 2017):
// `temporal_filter_atrous_<passo>_main`, passos 1, 2, 4, 8 e 16, uma invocação por pixel do sinal (sem sinal, zero). O
// núcleo B3 5 × 5, com os pesos do guia (o mesmo objeto; a distância entre os pontos em larguras de pixel no ponto,
// por pixel de distância na tela) e da luminância (pela variância da média filtrada em 3 × 3), de
// `temporal_filter_filter_in` para `temporal_filter_filter_out` (cor e variância); a variância com os pesos ao quadrado.
// Requer: color, temporal_filter_common, temporal_filter_source, temporal_filter_filter_in, temporal_filter_filter_out.

/** Escala do peso da luminância, em desvios padrão (σ_l do SVGF). */
const TEMPORAL_FILTER_SIGMA_LUMINANCE: f32 = 4.0;
/** Escala do peso do guia, em larguras de pixel no ponto por pixel de distância (o σ_z = 1 do SVGF, no espaço). */
const TEMPORAL_FILTER_SIGMA_POINT: f32 = 1.0;

/** Uma passada do à-trous com o passo `step`. */
fn temporal_filter_atrous(gid3: vec3u, nwg: vec3u, step: i32) {
    let pixel = temporal_filter_pixel(gid3, nwg);
    if (pixel.z == 0u) { return; }
    let px = pixel.xy;
    if (!temporal_filter_source_valid(px)) {
        textureStore(temporal_filter_filter_out, px, vec4f(0.0));
        return;
    }
    let center = textureLoad(temporal_filter_filter_in, px, 0);
    let guide = temporal_filter_source_guide(px);
    let id = bitcast<u32>(guide.w);
    let footprint = temporal_filter_source_footprint(px, guide);
    // A variância filtrada em 3 × 3 (gaussiana) guia o peso da luminância.
    var variance = 0.0;
    var vw = 0.0;
    for (var dy = -1; dy <= 1; dy++) {
        for (var dx = -1; dx <= 1; dx++) {
            let q = vec2i(px) + vec2i(dx, dy);
            if (!temporal_filter_inside(q)) { continue; }
            let k = select(0.5, 1.0, dx == 0) * select(0.5, 1.0, dy == 0);
            variance += k * textureLoad(temporal_filter_filter_in, vec2u(q), 0).a;
            vw += k;
        }
    }
    let sigma = TEMPORAL_FILTER_SIGMA_LUMINANCE * sqrt(variance / vw) + 1e-6;
    let lp = luminance(center.rgb);
    let h = array<f32, 3>(0.375, 0.25, 0.0625);
    var color = vec3f(0.0);
    var var_sum = 0.0;
    var weight = 0.0;
    for (var j = -2; j <= 2; j++) {
        for (var i = -2; i <= 2; i++) {
            let q = vec2i(px) + vec2i(i, j) * step;
            if (!temporal_filter_inside(q)) { continue; }
            let other = temporal_filter_source_guide(vec2u(q));
            if (bitcast<u32>(other.w) != id) { continue; }
            let s = textureLoad(temporal_filter_filter_in, vec2u(q), 0);
            let reach = TEMPORAL_FILTER_SIGMA_POINT * footprint * length(vec2f(vec2i(i, j) * step)) + 1e-6;
            let w = h[abs(i)] * h[abs(j)]
                * exp(-abs(luminance(s.rgb) - lp) / sigma)
                * exp(-length(other.xyz - guide.xyz) / reach);
            color += w * s.rgb;
            var_sum += w * w * s.a;
            weight += w;
        }
    }
    textureStore(temporal_filter_filter_out, px, vec4f(color / weight, var_sum / (weight * weight)));
}

@compute @workgroup_size(WORKGROUP_SIZE)
fn temporal_filter_atrous_1_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    temporal_filter_atrous(gid3, nwg, 1);
}

@compute @workgroup_size(WORKGROUP_SIZE)
fn temporal_filter_atrous_2_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    temporal_filter_atrous(gid3, nwg, 2);
}

@compute @workgroup_size(WORKGROUP_SIZE)
fn temporal_filter_atrous_4_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    temporal_filter_atrous(gid3, nwg, 4);
}

@compute @workgroup_size(WORKGROUP_SIZE)
fn temporal_filter_atrous_8_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    temporal_filter_atrous(gid3, nwg, 8);
}

@compute @workgroup_size(WORKGROUP_SIZE)
fn temporal_filter_atrous_16_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    temporal_filter_atrous(gid3, nwg, 16);
}
