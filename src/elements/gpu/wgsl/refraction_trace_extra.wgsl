// Antisserrilhado da refração (spec 034), o caminho das amostras extras: um fio por par (pixel marcado, amostra), todas
// num despacho só — com poucos pixels marcados, um despacho por amostra esperava a latência de um raio três vezes —,
// gravado nas texturas da lista (`refraction_aa_*`, na entrada do par: `refraction_aa_texel`). Nos pixels marcados para
// a dispersão, os três canais; marcados só por ela, um canal por amostra, no centro.
// Requer: refraction_trace_pixel, refraction_marks_read, as saídas da lista.

@compute @workgroup_size(64, 1, 1)
fn refraction_trace_extra_main(@builtin(global_invocation_id) gid: vec3u) {
    let mark = refraction_mark_at(gid.x / REFRACTION_EXTRA);
    let s = gid.x % REFRACTION_EXTRA;
    if (mark.x < 0) { return; }
    // Com o antisserrilhado, o ponto da amostra dentro do pixel (com a dispersão, os três canais); só a dispersão, a
    // amostra `s` traça o canal `s` no centro.
    var offset = refraction_sample_offset(s + 1u);
    var channel = select(REFRACTION_GREEN, REFRACTION_CHANNELS, mark.z != 0);
    if (mark.w == 0) {
        offset = vec2f(0.0);
        channel = i32(s);
    }
    let t = refraction_trace_pixel(mark.xy, offset, channel);
    let texel = refraction_aa_texel(gid.x);
    textureStore(refraction_aa_hit_out, texel, t.hit);
    textureStore(refraction_aa_partial_out, texel, t.partial);
    textureStore(refraction_aa_info_out, texel, t.info);
    textureStore(refraction_aa_throughput_out, texel, t.throughput);
}
