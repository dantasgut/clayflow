// Passada temporal do filtro de sinal traçado (spec 034, R3, T044a; o SVGF de Schied et al. 2017 com o gradiente
// temporal do A-SVGF de Schied et al. 2018): uma invocação por pixel do sinal (`temporal_filter_source`); sem sinal, zero
// (sem histórico no quadro seguinte).
// O histórico vem de onde a superfície do pixel estava no quadro anterior (`temporal_filter_surface_motion`, em UV),
// nos vizinhos que mostravam o mesmo ponto (`temporal_filter_guide_previous`: o mesmo objeto, a menos de
// `TEMPORAL_FILTER_HISTORY_GAP` larguras de pixel do ponto de agora levado ao quadro anterior) — bilinear, ou, se
// nenhum dos quatro serve (uma lente desloca a imagem), a média dos que servem em 3 × 3. O peso da amostra nova vai de
// 1/quadros (até `temporal_filter.history_max`) a 1 com a mudança da cena (`temporal_filter_source_change`, o α do
// A-SVGF): onde algo saiu, o histórico some, mesmo que só um caminho secundário o visse.
// Os momentos da luminância dão a variância das amostras (com menos de 4 quadros, a dos vizinhos 5 × 5 do mesmo
// objeto); a da média — dividida pelos quadros, e multiplicada por 4/quadros com menos de 4 (como o SVGF) — guia o
// filtro espacial: o pixel convergido quase não é filtrado, o recomeçado é bem filtrado. Sai a média com a variância da
// média (`temporal_filter_accumulated_out`) e os momentos com os quadros (`temporal_filter_moments_out`) — as fatias de
// agora dos canais temporais (spec 037), que o quadro seguinte lê como histórico —, o guia de agora
// (`temporal_filter_guide_out`, idem) e a média de novo no par das passadas à-trous (`temporal_filter_work_out`: o
// filtro espacial não toca o histórico).
// O histórico reprojetado fica dentro da caixa mínimo–máximo das amostras de agora do mesmo objeto em 3 × 3 (o recorte
// da vizinhança de Karis 2014): o que mudou sem acusar mudança (a imagem que a lente leva de um objeto que se move, o
// xadrez visto pelo vidro com a câmera andando) não fica para trás como rastro ou borrão. Com menos de duas amostras do
// objeto a caixa não vale (seria a própria amostra, com o ruído dela).
// Requer: color, temporal, temporal_filter, temporal_filter_common, temporal_filter_source, temporal_filter_surface_motion,
// temporal_filter_guide_previous, temporal_filter_history_color, temporal_filter_history_moments,
// temporal_filter_accumulated_out, temporal_filter_moments_out, temporal_filter_guide_out, temporal_filter_work_out.

/** Peso mínimo da amostra nova nos momentos (o valor do SVGF: a variância acompanha a cena mais depressa que a cor). */
const TEMPORAL_FILTER_MOMENTS_ALPHA: f32 = 0.2;
/**
 * Distância, em larguras de pixel no ponto, até a qual o ponto do quadro anterior é o mesmo: a amostra se desloca até
 * meia largura dentro do pixel a cada quadro, nos dois quadros, e a reprojeção bilinear erra até meia largura (empírico
 * a partir disso: 1,5 larguras, arredondado para cima).
 */
const TEMPORAL_FILTER_HISTORY_GAP: f32 = 2.0;

/** O pixel `q` do quadro anterior mostrava o ponto `before` do objeto `id` (com histórico)? */
fn temporal_filter_history_matches(q: vec2i, id: u32, before: vec3f, footprint: f32) -> bool {
    let size = vec2i(textureDimensions(temporal_filter_guide_previous));
    if (any(q < vec2i(0)) || any(q >= size)) { return false; }
    let shown = bitcast<vec4f>(textureLoad(temporal_filter_guide_previous, vec2u(q), 0));
    return textureLoad(temporal_filter_history_moments, vec2u(q), 0).z > 0.0
        && temporal_validate_object(bitcast<u32>(shown.w), id, shown.xyz, before, footprint, TEMPORAL_FILTER_HISTORY_GAP);
}

/** O histórico `color` dentro da caixa das amostras de agora do objeto `id` em volta de `px`. */
fn temporal_filter_clamp_history(px: vec2u, id: u32, color: vec3f) -> vec3f {
    var lo = vec3f(3.0e38);
    var hi = vec3f(-3.0e38);
    var n = 0u;
    for (var dy = -1; dy <= 1; dy++) {
        for (var dx = -1; dx <= 1; dx++) {
            let q = vec2i(px) + vec2i(dx, dy);
            if (!temporal_filter_inside(q)) { continue; }
            let u = vec2u(q);
            if (!temporal_filter_source_valid(u)) { continue; }
            if (bitcast<u32>(temporal_filter_source_guide(u).w) != id) { continue; }
            let c = temporal_filter_source_signal(u);
            lo = min(lo, c);
            hi = max(hi, c);
            n += 1u;
        }
    }
    if (n < 2u) { return color; }
    return clamp(color, lo, hi);
}

@compute @workgroup_size(WORKGROUP_SIZE)
fn temporal_filter_temporal_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let pixel = temporal_filter_pixel(gid3, nwg);
    if (pixel.z == 0u) { return; }
    let px = pixel.xy;
    // O guia de agora, em todo pixel e em bits (o id é bits de float): o quadro seguinte valida o histórico por ele.
    textureStore(temporal_filter_guide_out, px, bitcast<vec4u>(temporal_filter_source_guide(px)));
    if (!temporal_filter_source_valid(px)) {
        textureStore(temporal_filter_accumulated_out, px, vec4f(0.0));
        textureStore(temporal_filter_moments_out, px, vec4f(0.0));
        textureStore(temporal_filter_work_out, px, vec4f(0.0));
        return;
    }
    let guide = temporal_filter_source_guide(px);
    let id = bitcast<u32>(guide.w);
    let before = temporal_filter_source_previous_point(guide);
    let footprint = temporal_filter_source_footprint(px, guide);
    // Onde a superfície estava, em pixels (centros em +0,5).
    let size = vec2f(temporal_filter_source_size());
    let at = vec2f(px) + textureLoad(temporal_filter_surface_motion, px, 0).xy * size;
    let base = vec2i(floor(at));
    let f = at - vec2f(base);
    var color = vec3f(0.0);
    var moments = vec3f(0.0);
    var weight = 0.0;
    for (var k = 0; k < 4; k++) {
        let o = vec2i(k & 1, k >> 1);
        let q = base + o;
        if (!temporal_filter_history_matches(q, id, before, footprint)) { continue; }
        let w = select(1.0 - f.x, f.x, o.x == 1) * select(1.0 - f.y, f.y, o.y == 1);
        color += w * textureLoad(temporal_filter_history_color, vec2u(q), 0).rgb;
        moments += w * textureLoad(temporal_filter_history_moments, vec2u(q), 0).xyz;
        weight += w;
    }
    if (weight < 1e-3) {
        // Uma lente desloca a imagem: os vizinhos que mostravam o mesmo ponto.
        color = vec3f(0.0);
        moments = vec3f(0.0);
        weight = 0.0;
        let center = vec2i(round(at));
        for (var dy = -1; dy <= 1; dy++) {
            for (var dx = -1; dx <= 1; dx++) {
                let q = center + vec2i(dx, dy);
                if (!temporal_filter_history_matches(q, id, before, footprint)) { continue; }
                color += textureLoad(temporal_filter_history_color, vec2u(q), 0).rgb;
                moments += textureLoad(temporal_filter_history_moments, vec2u(q), 0).xyz;
                weight += 1.0;
            }
        }
    }
    let c = temporal_filter_source_signal(px);
    let l = luminance(c);
    var alpha = 1.0;
    if (weight > 0.0) {
        color = temporal_filter_clamp_history(px, id, color / weight);
        moments /= weight;
        alpha = temporal_weight_change(temporal_weight_count(moments.z, temporal_filter.history_max), temporal_filter_source_change(px));
    }
    let frames = 1.0 / alpha;
    let mixed = select(c, mix(color, c, alpha), weight > 0.0);
    var m = vec2f(l, l * l);
    if (weight > 0.0) { m = temporal_moments(moments.xy, l, alpha, TEMPORAL_FILTER_MOMENTS_ALPHA); }
    var variance = temporal_variance(m);
    if (frames < 4.0) {
        // Pouco histórico: a variância dos vizinhos que mostram o mesmo objeto.
        var s = vec2f(0.0);
        var n = 0.0;
        for (var dy = -2; dy <= 2; dy++) {
            for (var dx = -2; dx <= 2; dx++) {
                let q = vec2i(px) + vec2i(dx, dy);
                if (!temporal_filter_inside(q)) { continue; }
                if (bitcast<u32>(temporal_filter_source_guide(vec2u(q)).w) != id) { continue; }
                let lq = luminance(temporal_filter_source_signal(vec2u(q)));
                s += vec2f(lq, lq * lq);
                n += 1.0;
            }
        }
        s /= n;
        variance = temporal_variance(s);
    }
    let accumulated = vec4f(mixed, temporal_mean_variance(variance, frames));
    textureStore(temporal_filter_accumulated_out, px, accumulated);
    textureStore(temporal_filter_work_out, px, accumulated);
    textureStore(temporal_filter_moments_out, px, vec4f(m, frames, 0.0));
}
