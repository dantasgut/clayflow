// Desfoque da rugosidade, passada horizontal (spec 034, R5): da radiância traçada para o intermediário.
// Requer: refraction_blur, refraction_radiance (leitura), refraction_blur_out.

@compute @workgroup_size(8, 8, 1)
fn refraction_blur_h_main(@builtin(global_invocation_id) gid: vec3u) {
    let size = textureDimensions(refraction_radiance);
    if (gid.x >= size.x || gid.y >= size.y) { return; }
    let pixel = vec2i(gid.xy);
    textureStore(refraction_blur_out, pixel, refraction_blur_pass(refraction_radiance, pixel, vec2i(1, 0)));
}
