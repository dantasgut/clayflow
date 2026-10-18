// A radiância transmitida de cada pixel com pedido (spec 034): a amostra do centro. Os pixels marcados (antisserrilhado,
// dispersão) são reescritos depois pela média deles (`refraction_resolve_marks.wgsl`); os sem pedido ficam como estão.
// Requer: refraction_hit (leitura), refraction_accum_in, refraction_radiance (escrita).

@compute @workgroup_size(8, 8, 1)
fn refraction_resolve_main(@builtin(global_invocation_id) gid: vec3u) {
    let size = textureDimensions(refraction_accum_in);
    if (gid.x >= size.x || gid.y >= size.y) { return; }
    let pixel = vec2i(gid.xy);
    if (textureLoad(refraction_hit, pixel, 0).w < 0.0) { return; }
    textureStore(refraction_radiance, pixel, textureLoad(refraction_accum_in, pixel, 0));
}
