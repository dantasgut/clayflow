// O meio de cada corpo de fluido (spec 039): a absorção dos trechos dentro da água (`ray_volume_transmittance`) e a luz
// das fontes que atravessa a água (`light_transmission`) leem o meio do corpo — o do fechamento dele, avaliado uma vez
// por quadro na onda dos acertos (o meio homogêneo por corpo), sem avaliar material na marcha. `field_body_record_main`
// grava, por corpo da tabela, o acerto sintético no centro da caixa do campo (a normal para cima, o tempo simulado do
// quadro, as constantes de um volume e a função `material` do corpo; sem função, o fechamento vazio); depois do material
// por classe, `field_body_closure_main` grava o meio no buffer das consultas (`field_medium` o lê).
// Requer: WORKGROUP_SIZE, fields, closure, ray_volume_material, ray_wave, field_data_voxels.

@compute @workgroup_size(WORKGROUP_SIZE)
fn field_body_record_main(@builtin(global_invocation_id) gid: vec3u) {
    let k = gid.x;
    if (k >= fluid_field.media.y) { return; }
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
    if (k >= fluid_field.media.y) { return; }
    let c = ray_wave_entries[k].closure;
    let w = fluid_field.media.x + k * FIELD_MEDIUM_WORDS;
    field_data_voxels[w] = c.transmission_color.r;
    field_data_voxels[w + 1u] = c.transmission_color.g;
    field_data_voxels[w + 2u] = c.transmission_color.b;
    field_data_voxels[w + 3u] = c.transmission_depth;
    field_data_voxels[w + 4u] = c.transmission_ior;
    field_data_voxels[w + 5u] = c.transmission_abbe;
    field_data_voxels[w + 6u] = c.transmission_weight;
    field_data_voxels[w + 7u] = 0.0;
}
