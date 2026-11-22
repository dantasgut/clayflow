// Máscara reativa do disco do sol por compute (spec 041, T074; ver `sky_reactive.wgsl` e `sky_reactive_rect.wgsl`): um
// grupo por bloco de `SKY_REACTIVE_TILE`² pixels do retângulo dos discos, pelo despacho indireto que a GPU montou; cada
// invocação marca o seu pixel pelo máximo com o que outro estágio marcou no quadro (a refração), lendo e escrevendo a
// máscara — o passe de desenho carregava e gravava a máscara inteira mesmo com o retângulo vazio.
// Requer: sky_reactive, SKY_REACTIVE_TILE, sky_reactive_work_read, sky_reactive_mask (r8unorm, leitura e escrita).

@compute @workgroup_size(SKY_REACTIVE_TILE, SKY_REACTIVE_TILE)
fn sky_reactive_tiles_main(@builtin(global_invocation_id) gid: vec3u) {
    let px = vec2u(sky_reactive_work_read[4], sky_reactive_work_read[5]) + gid.xy;
    if (any(px >= textureDimensions(sky_reactive_mask))) { return; }
    let d = SkyReactiveDisks(
        vec4f(
            bitcast<f32>(sky_reactive_work_read[6]),
            bitcast<f32>(sky_reactive_work_read[7]),
            bitcast<f32>(sky_reactive_work_read[8]),
            bitcast<f32>(sky_reactive_work_read[9]),
        ),
        bitcast<f32>(sky_reactive_work_read[10]),
    );
    let v = sky_reactive_mark(px, vec2f(px) + 0.5, d);
    if (v <= 0.0) { return; }
    let m = textureLoad(sky_reactive_mask, px).r;
    textureStore(sky_reactive_mask, px, vec4f(max(m, v), 0.0, 0.0, 1.0));
}
