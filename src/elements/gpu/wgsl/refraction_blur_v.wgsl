// Desfoque da rugosidade, passada vertical (spec 034, R5): do intermediário de volta à radiância traçada.
// Requer: refraction_blur, refraction_blur_in (leitura), refraction_radiance (escrita).

@compute @workgroup_size(8, 8, 1)
fn refraction_blur_v_main(@builtin(global_invocation_id) gid: vec3u) {
    let size = textureDimensions(refraction_blur_in);
    if (gid.x >= size.x || gid.y >= size.y) { return; }
    let pixel = vec2i(gid.xy);
    textureStore(refraction_radiance, pixel, refraction_blur_pass(refraction_blur_in, pixel, vec2i(0, 1)));
}
