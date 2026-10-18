// Antisserrilhado e dispersão da refração traçada (spec 034), a luz das amostras extras: um fio por par (entrada da
// lista dos marcados, amostra), num despacho só, lendo o caminho nas texturas da lista e gravando a radiância no texel
// do par (`refraction_aa_radiance_out`); a média dos marcados fecha em `refraction_resolve_marks_main`.
// Requer: refraction_shade, refraction_marks_read, as texturas do caminho da lista, refraction_aa_radiance_out (escrita).

@compute @workgroup_size(64, 1, 1)
fn refraction_sample_main(@builtin(global_invocation_id) gid: vec3u) {
    let mark = refraction_mark_at(gid.x / REFRACTION_EXTRA);
    if (mark.x < 0) { return; }
    let texel = refraction_aa_texel(gid.x);
    let at = textureLoad(refraction_aa_hit, texel, 0);
    var radiance = vec3f(0.0);
    if (at.w >= 0.0) {
        radiance = refraction_shade_values(
            textureLoad(refraction_aa_partial, texel, 0),
            at,
            textureLoad(refraction_aa_info, texel, 0),
            textureLoad(refraction_aa_throughput, texel, 0).rgb,
        );
    }
    textureStore(refraction_aa_radiance_out, texel, vec4f(radiance, 1.0));
}
