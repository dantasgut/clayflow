// Refração pela estrutura de raios (spec 034, R1–R2), o primeiro kernel, amostra do centro: o caminho de cada pedido (os
// do vidro, gravados pelo passe de pedidos do desenho; os da água, pela vista da água), gravado nas texturas do pixel —
// o que não depende das luzes (`refraction_partial`), a superfície vista (`refraction_hit`, `refraction_hit_info`) e o
// quanto chega dela (`refraction_throughput`). O segundo kernel (`refraction_shade_main.wgsl`) soma a luz dela.
// Requer: refraction_trace_pixel e as saídas.

@compute @workgroup_size(8, 8, 1)
fn refraction_trace_main(@builtin(global_invocation_id) gid: vec3u) {
    let size = textureDimensions(refraction_request);
    if (gid.x >= size.x || gid.y >= size.y) { return; }
    let pixel = vec2i(gid.xy);
    let t = refraction_trace_pixel(pixel, vec2f(0.0), REFRACTION_GREEN);
    textureStore(refraction_hit, pixel, t.hit);
    if (t.hit.w < 0.0) { return; }
    textureStore(refraction_partial, pixel, t.partial);
    textureStore(refraction_hit_info, pixel, t.info);
    textureStore(refraction_throughput, pixel, t.throughput);
}
