// A luz da amostra do centro de cada pixel (spec 034, R3): grava a radiância dela no acumulador (`refraction_accum_out`:
// rgb e, em a, a distância à primeira superfície, a do desfoque da rugosidade) — a média com as amostras extras do
// antisserrilhado fecha em `refraction_resolve_main`.
// Requer: refraction_shade, as texturas do caminho do centro, refraction_accum_out (escrita).

@compute @workgroup_size(8, 8, 1)
fn refraction_shade_main(@builtin(global_invocation_id) gid: vec3u) {
    let size = textureDimensions(refraction_hit);
    if (gid.x >= size.x || gid.y >= size.y) { return; }
    let pixel = vec2i(gid.xy);
    let at = textureLoad(refraction_hit, pixel, 0);
    if (at.w < 0.0) { return; }
    let partial = textureLoad(refraction_partial, pixel, 0);
    let radiance = refraction_shade_values(
        partial,
        at,
        textureLoad(refraction_hit_info, pixel, 0),
        textureLoad(refraction_throughput, pixel, 0).rgb,
    );
    textureStore(refraction_accum_out, pixel, vec4f(radiance, partial.a));
}
