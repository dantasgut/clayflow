// O material da água num acerto do campo dos fluidos (spec 034, T065d), comum à contribuição ao ponto
// `ray_volume_surface` e à absorção dos trechos (`ray_volume_transmittance`): a função `material` do corpo (`FluidBody`
// com `MaterialFunction`, a aparência pelo grafo) pelo índice dela na composição dos acertos dos raios e o slot dos
// parâmetros — quem traça avalia a função no acerto pela onda dos acertos (spec 039) — e o meio do corpo, avaliado uma
// vez por quadro (`field_medium`: o meio homogêneo, que a absorção dos trechos lê); sem corpo, nenhum.
// Requer: ray_volume_types, fields, closure, field_data.

/**
 * O meio do corpo `body` (índice + 1; 0 = nenhum): um fechamento só com a transmissão do fechamento do corpo — a cor e a
 * profundidade da absorção, o índice de refração, o número de Abbe e o peso.
 */
fn field_medium(body: u32) -> Closure {
    var c = closure_zero();
    if (body == 0u || body > fluid_field.media.y) { return c; }
    let w = fluid_field.media.x + (body - 1u) * FIELD_MEDIUM_WORDS;
    c.transmission_color = vec3f(bitcast<f32>(field_data[w]), bitcast<f32>(field_data[w + 1u]),
        bitcast<f32>(field_data[w + 2u]));
    c.transmission_depth = bitcast<f32>(field_data[w + 3u]);
    c.transmission_ior = bitcast<f32>(field_data[w + 4u]);
    c.transmission_abbe = bitcast<f32>(field_data[w + 5u]);
    c.transmission_weight = bitcast<f32>(field_data[w + 6u]);
    return c;
}

/** O material no acerto `hit` do campo (o corpo em `hit.material`). */
fn field_surface(hit: RayVolumeHit) -> RayVolumeSurface {
    let body = field_body(hit.material);
    return RayVolumeSurface(body.x, body.y, field_medium(hit.material));
}
