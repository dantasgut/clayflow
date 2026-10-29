// O material de cada corpo de fluido (spec 039): a absorção dos trechos dentro da água (`ray_volume_transmittance`) e a
// luz das fontes que atravessa a água (`light_transmission`) leem o fechamento do corpo, avaliado uma vez por quadro na
// onda dos acertos — o meio homogêneo por corpo, sem avaliar material na marcha. `field_body_record_main` grava, por
// corpo da tabela, o acerto sintético no centro da caixa do campo (a normal para cima, o tempo simulado do quadro, as
// constantes de um volume e a função `material` do corpo; sem função, o fechamento vazio); depois do material por classe,
// `field_body_closure_main` copia o fechamento para `field_body_closures` (aqui, `field_body_closures_out`).
// Requer: WORKGROUP_SIZE, fields, closure, ray_volume_material, ray_wave, field_body_closures_out.

@compute @workgroup_size(WORKGROUP_SIZE)
fn field_body_record_main(@builtin(global_invocation_id) gid: vec3u) {
    let k = gid.x;
    if (k >= arrayLength(&field_body_closures_out)) { return; }
    let body = field_body(k + 1u);
    let box = field_box();
    let center = 0.5 * (box[0] + box[1]);
    let time = fluid_field.time.x;
    let m = ray_volume_standard();
    if (body.x == 0u) {
        ray_wave_put_shaded(k, ray_wave_hit(center, vec3f(0.0, 1.0, 0.0), vec2f(0.0), time, 0.0, 0.0, m, 0u,
            RAY_WAVE_SHADED, k, vec4f(0.0)), closure_zero());
        return;
    }
    ray_wave_put_surface(k, body.x, body.y, center, vec3f(0.0, 1.0, 0.0), vec2f(0.0), time, 0.0, 0.0, m, vec4f(0.0));
}

@compute @workgroup_size(WORKGROUP_SIZE)
fn field_body_closure_main(@builtin(global_invocation_id) gid: vec3u) {
    let k = gid.x;
    if (k >= arrayLength(&field_body_closures_out)) { return; }
    field_body_closures_out[k] = ray_wave_entries[k].closure;
}
