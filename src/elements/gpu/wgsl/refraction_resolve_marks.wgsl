// A média dos pixels marcados (spec 034), sobre a radiância da amostra do centro: um fio por entrada da lista (o
// despacho indireto dos pares da rodada, um fio a cada `REFRACTION_EXTRA`).
// - Antisserrilhado: a média do centro com as extras (pontos dentro do pixel).
// - Dispersão com antisserrilhado: o vermelho e o azul, a média das extras (os três canais traçados em cada uma); o
//   verde soma o do centro (o raio do verde). Só a dispersão: cada canal, a amostra dele no centro.
// Requer: refraction_marks_read, REFRACTION_EXTRA, refraction_accum_in, refraction_aa_radiance,
// refraction_radiance (escrita).

fn refraction_pair_radiance(i: u32, s: u32) -> vec3f {
    return textureLoad(refraction_aa_radiance, refraction_aa_texel(i * REFRACTION_EXTRA + s), 0).rgb;
}

@compute @workgroup_size(64, 1, 1)
fn refraction_resolve_marks_main(@builtin(global_invocation_id) gid: vec3u) {
    if (gid.x % REFRACTION_EXTRA != 0u) { return; }
    let i = gid.x / REFRACTION_EXTRA;
    let mark = refraction_mark_at(i);
    if (mark.x < 0) { return; }
    let center = textureLoad(refraction_accum_in, mark.xy, 0);
    var c = center.rgb;
    if (mark.w == 0) {
        c = vec3f(refraction_pair_radiance(i, 0u).r, refraction_pair_radiance(i, 1u).g, refraction_pair_radiance(i, 2u).b);
    } else if (mark.z == 0) {
        for (var s = 0u; s < REFRACTION_EXTRA; s++) { c += refraction_pair_radiance(i, s); }
        c = c / f32(REFRACTION_EXTRA + 1u);
    } else {
        var sum = vec3f(0.0, center.g, 0.0);
        for (var s = 0u; s < REFRACTION_EXTRA; s++) { sum += refraction_pair_radiance(i, s); }
        let n = f32(REFRACTION_EXTRA);
        c = sum / vec3f(n, n + 1.0, n);
    }
    textureStore(refraction_radiance, mark.xy, vec4f(c, center.a));
}
