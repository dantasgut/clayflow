// Segunda passada do filtro: de `work` para a saída que o desenho lê, passo 2.
// Requer: area_shadow_filter; as_work (leitura), as_output_out (escrita).

@compute @workgroup_size(8, 8)
fn area_shadow_atrous_b_main(@builtin(global_invocation_id) gid: vec3u) {
    let dim = textureDimensions(as_work);
    if (gid.x >= dim.x || gid.y >= dim.y) { return; }
    textureStore(as_output_out, vec2i(gid.xy), as_atrous(as_work, vec2i(gid.xy), 2));
}
