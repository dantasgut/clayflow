// Pedidos de páginas pela profundidade da cena com amostras (MSAA): a amostra 0 (ver `shadow_request`).

@compute @workgroup_size(8, 8)
fn shadow_request_ms_main(@builtin(global_invocation_id) gid: vec3u) {
    let size = textureDimensions(scene_depth);
    if (gid.x >= size.x || gid.y >= size.y) { return; }
    shadow_request_at(gid.xy, textureLoad(scene_depth, gid.xy, 0), size);
}
