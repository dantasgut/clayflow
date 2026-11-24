// A espessura do corpo entre a luz e um ponto pelo mapa de sombra virtual (spec 011, T113): a distância, ao longo da
// direção da luz, da primeira superfície que a luz vê (a profundidade guardada no mapa) até o ponto — por onde passa a
// luz que atravessa as partes finas de um material com subsuperfície. Calculada do mapa do quadro, sem tabela. Vale nos
// dois tipos de vista (spec 013): na em perspectiva, o texel em metros pela distância e a espessura ao longo do raio.
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
    // Fora do tronco da vista em perspectiva, a espessura não é conhecida.
    if (m.kind == 1u && (p0.z < m.near || p0.z > m.far)) { return vec2f(-1.0, 0.0); }
    // Metros por unidade do plano da vista no ponto (1 na ortográfica).
    let scale = sv_metres(m, p0.z);
    // Só o nível do ponto (ou o seguinte): num nível mais grosso o recuo de um texel para dentro do corpo passa de
    // centímetros e atravessa as partes finas — nada fica à frente e a espessura sairia zero (a luz inteira
    // atravessando o nariz, a orelha, a borda do rosto). Sem a página fina desenhada, a espessura não é conhecida.
    let want = sv_level_at(m, world_pos, p0);
    let k = sv_readable_level(m, want, p0.xy);
    if (k >= levels || k > want + 1u) { return vec2f(-1.0, 0.0); }
    let t = sv_texel(m, k);
    let pl = sv_light(m, world_pos - normal * (t * scale));
    let x = pl.xy / t - 0.5;
    let base = floor(x);
    let f = x - base;
    var z: array<f32, 4>;
    var ok: array<bool, 4>;
    var sum = 0.0;
    var weight = 0.0;
    var read = false;
    for (var i = 0u; i < 4u; i++) {
        let o = vec2f(f32(i & 1u), f32(i >> 1u));
        let s = sv_stored_depth(m, k, (base + o + 0.5) * t);
        let w = mix(vec2f(1.0) - f, f, o);
        z[i] = s.x;
        read = read || s.y > 0.0;
        ok[i] = s.y > 0.0 && s.x < pl.z;
        if (ok[i]) {
            sum += s.x * w.x * w.y;
            weight += w.x * w.y;
        }
    }
    let facing = max(-dot(normal, light_dir), 0.0);
    // Na vista em perspectiva, nenhuma profundidade lida (o ponto recuado saiu do tronco, na aresta entre duas faces do
    // cubo): a espessura não é conhecida — nunca zero.
    if (m.kind == 1u && !read) { return vec2f(-1.0, 0.0); }
    if (weight <= 0.0) { return vec2f(0.0, facing); }
    // A inclinação da superfície de entrada (dz por metro no plano da luz) pelos pares de texels que valem.
    var slope = vec2f(0.0);
    var known = true;
    // Por metro do plano: o texel em metros à profundidade do ponto.
    let tm = t * scale;
    if (ok[0] && ok[1]) { slope.x = (z[1] - z[0]) / tm; } else if (ok[2] && ok[3]) { slope.x = (z[3] - z[2]) / tm; } else { known = false; }
    if (ok[0] && ok[2]) { slope.y = (z[2] - z[0]) / tm; } else if (ok[1] && ok[3]) { slope.y = (z[3] - z[1]) / tm; } else { known = false; }
    let cos_entry = select(facing, inverseSqrt(1.0 + dot(slope, slope)), known);
    // Ao longo do raio da luz: na vista em perspectiva o raio faz um ângulo com o eixo (a diferença de profundidade
    // pelo comprimento de (q · tan, 1)).
    let along = select(1.0, length(vec3f(p0.xy * m.origin.w, 1.0)), m.kind == 1u);
    return vec2f(max(p0.z - sum / weight, 0.0) * along, cos_entry);
}

// A espessura atravessada pela luz no ponto `world_pos` pelo mapa de sombra de referencial `base`, de qualquer tipo de
// vista (spec 013): a vista é a do ponto recuado um texel para dentro do corpo (`sv_point_view`: na pontual, a face do
// cubo), e a leitura, `shadow_virtual_thickness` nela — uma chamada só, qualquer que seja a luz.
fn shadow_light_thickness(base: ShadowMatrix, world_pos: vec3f, normal: vec3f, light_dir: vec3f) -> vec2f {
    if (sv_levels(base) == 0u) { return vec2f(-1.0, 0.0); }
    return shadow_virtual_thickness(sv_point_view(base, world_pos, -normal), world_pos, normal, light_dir);
}
