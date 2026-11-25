// Primeira passada do filtro: da média no tempo (a fatia de agora) para `work`, passo 1.
// Requer: area_shadow_filter; as_accumulated_now (leitura), as_work_out (escrita).

@compute @workgroup_size(8, 8)
fn area_shadow_atrous_a_main(@builtin(global_invocation_id) gid: vec3u) {
    let dim = textureDimensions(as_accumulated_now);
    if (gid.x >= dim.x || gid.y >= dim.y) { return; }
    textureStore(as_work_out, vec2i(gid.xy), as_atrous(as_accumulated_now, vec2i(gid.xy), 1));
}
