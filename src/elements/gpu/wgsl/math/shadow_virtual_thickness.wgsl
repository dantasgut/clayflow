// A espessura do corpo entre a luz e um ponto pelo mapa de sombra virtual (spec 011, T113): a distância, ao longo da
// direção da luz, da primeira superfície que a luz vê (a profundidade guardada no mapa) até o ponto — por onde passa a
// luz que atravessa as partes finas de um material com subsuperfície. Calculada do mapa do quadro, sem tabela.
// Requer: shadow_virtual, shadow_virtual_read.

// A profundidade guardada (z no espaço da luz, m) no texel do nível `k` que contém o ponto `q` do plano da luz; y = 1
// se a página foi desenhada.
fn sv_stored_depth(m: ShadowMatrix, k: u32, q: vec2f) -> vec2f {
    let g = sv_page_of(m, k, q);
    if (!sv_in_window(m, k, g)) { return vec2f(0.0); }
    let e = shadow_table_entry(m, sv_slot(m, k, g));
    if (!sv_readable(e, g)) { return vec2f(0.0); }
    let t = sv_texel(m, k);
    let tx = vec2u(clamp(vec2i(floor(1.0 + (q - vec2f(g) * sv_page_size(m, k)) / t)), vec2i(0), vec2i(i32(SV_STRIDE) - 1)));
    let d = bitcast<f32>(shadow_atlas[sv_page_word(m, e.z & SV_PHYS_MASK, tx)]);
    return vec2f((d - 0.5) * 2.0 * m.depthRange + bitcast<f32>(e.w), 1.0);
}

// A espessura (x, em m; < 0: o mapa não cobre o ponto) e o cosseno da luz na superfície de entrada (y) para o ponto
// `world_pos` de normal `normal`, do lado contra a luz `light_dir` (unitária, do ponto para a luz). As quatro
// profundidades em volta do ponto (recuado um texel para dentro do corpo pela normal: na silhueta vista da luz, o texel
// de fora não vale) pesadas bilinearmente, só as que estão à frente dele; a inclinação da superfície de entrada pelas
// diferenças entre elas. Nenhuma à frente (uma folha de uma face só): espessura 0 e o cosseno da própria face.
fn shadow_virtual_thickness(m: ShadowMatrix, world_pos: vec3f, normal: vec3f, light_dir: vec3f) -> vec2f {
    let levels = sv_levels(m);
    if (levels == 0u) { return vec2f(-1.0, 0.0); }
    let p0 = sv_light(m, world_pos);
    let k = sv_readable_level(m, sv_level(m, p0.xy), p0.xy);
    if (k >= levels) { return vec2f(-1.0, 0.0); }
    let t = sv_texel(m, k);
    let pl = sv_light(m, world_pos - normal * t);
    let x = pl.xy / t - 0.5;
    let base = floor(x);
    let f = x - base;
    var z: array<f32, 4>;
    var ok: array<bool, 4>;
    var sum = 0.0;
    var weight = 0.0;
    for (var i = 0u; i < 4u; i++) {
        let o = vec2f(f32(i & 1u), f32(i >> 1u));
        let s = sv_stored_depth(m, k, (base + o + 0.5) * t);
        let w = mix(vec2f(1.0) - f, f, o);
        z[i] = s.x;
        ok[i] = s.y > 0.0 && s.x < pl.z;
        if (ok[i]) {
            sum += s.x * w.x * w.y;
            weight += w.x * w.y;
        }
    }
    let facing = max(-dot(normal, light_dir), 0.0);
    if (weight <= 0.0) { return vec2f(0.0, facing); }
    // A inclinação da superfície de entrada (dz por metro no plano da luz) pelos pares de texels que valem.
    var slope = vec2f(0.0);
    var known = true;
    if (ok[0] && ok[1]) { slope.x = (z[1] - z[0]) / t; } else if (ok[2] && ok[3]) { slope.x = (z[3] - z[2]) / t; } else { known = false; }
    if (ok[0] && ok[2]) { slope.y = (z[2] - z[0]) / t; } else if (ok[1] && ok[3]) { slope.y = (z[3] - z[1]) / t; } else { known = false; }
    let cos_entry = select(facing, inverseSqrt(1.0 + dot(slope, slope)), known);
    return vec2f(max(p0.z - sum / weight, 0.0), cos_entry);
}
