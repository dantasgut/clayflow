// O que o histórico de um pixel com pedido precisa (spec 034, R3, T044a), comum ao movimento do que a refração mostra e
// ao filtro do traçado: onde estava no quadro anterior o ponto que o traçado achou (`refraction_hit`), a largura do
// pixel nesse ponto e quanto a cena mudou em volta do pixel pelas marcas de movimento do traçado (a de agora e a
// anterior).
// Requer: NONE, refraction, cameras, renderables, world_inverses, previous_worlds, refraction_hit, refraction_albedo,
// refraction_gradient.

/**
 * Onde estava, no quadro anterior, o ponto mostrado `hit` (xyz, registro em bits no w): no espaço do objeto atingido
 * pela inversa da matriz de mundo (a guardada pelo estágio de transformação, spec 037), de volta pela matriz de mundo
 * anterior. Sem objeto (o céu, as esferas das partículas) ou sem histórico, o mesmo ponto.
 */
fn refraction_previous_point(hit: vec4f) -> vec3f {
    let record = bitcast<u32>(hit.w);
    if (record == NONE) { return hit.xyz; }
    let slot = renderables[record].transformSlot;
    let previous = previous_worlds[slot].world;
    if (previous[3].w == 0.0) { return hit.xyz; }
    let object = affine_point(world_inverses[slot].inverse, hit.xyz);
    return (previous * vec4f(object, 1.0)).xyz;
}

/** Distância entre o ponto mostrado `hit` e o do pixel `q` (o mesmo objeto; senão 0). */
fn refraction_neighbor_gap(hit: vec4f, q: vec2u) -> f32 {
    let other = textureLoad(refraction_hit, q, 0);
    return select(0.0, length(other.xyz - hit.xyz), bitcast<u32>(other.w) == bitcast<u32>(hit.w));
}

/**
 * Largura do pixel `px` no ponto que ele mostra (`hit`): a distância ao ponto dos vizinhos da direita e de baixo (do
 * mesmo objeto) — o que a lente amplia —, no mínimo a da vista direta àquela distância da câmera.
 */
fn refraction_footprint(px: vec2u, hit: vec4f) -> f32 {
    let last = vec2u(textureDimensions(refraction_hit)) - 1u;
    let footprint = pixel_footprint(refraction.camera_slot, vec2f(last + 1u), hit.xyz);
    return max(footprint, max(refraction_neighbor_gap(hit, min(px + vec2u(1u, 0u), last)),
        refraction_neighbor_gap(hit, min(px + vec2u(0u, 1u), last))));
}

/**
 * Quanto a cena mudou em volta do pixel `px`, em 0–1: a maior parte da luz que veio por caminhos que tocaram algo em
 * movimento, neste quadro (`refraction_albedo`, alfa) ou no anterior (`refraction_gradient`), nos pixels 3 × 3 em volta
 * (a amostra se desloca dentro do pixel). Zero onde nada se moveu, também com a câmera em movimento.
 */
fn refraction_change(px: vec2u) -> f32 {
    let last = vec2i(textureDimensions(refraction_gradient)) - 1;
    var change = 0.0;
    for (var dy = -1; dy <= 1; dy++) {
        for (var dx = -1; dx <= 1; dx++) {
            let q = vec2u(clamp(vec2i(px) + vec2i(dx, dy), vec2i(0), last));
            change = max(change, max(textureLoad(refraction_gradient, q, 0).x, textureLoad(refraction_albedo, q, 0).a));
        }
    }
    return clamp(change, 0.0, 1.0);
}
