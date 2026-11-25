// A espessura atravessada pela luz de área no desenho (spec 013, T043): a distância por dentro do corpo, do ponto até
// a saída na direção do centro da fonte, e o cosseno da luz na superfície de saída — do traçado do `AreaShadowFlow`
// (`area_shadow_thickness_map`, `area_shadow_entry`; `area_shadow_taps`), só dos texels em que foi medida. Sem texel
// que valha, ou para a luz que não é de área com sombra, desconhecida (x < 0).
// Requer: area_shadow_lookup, lights, area_shadow_thickness_map, area_shadow_entry.

fn light_thickness(light: u32, p: vec3f, n: vec3f) -> vec2f {
    let channel = area_shadow_channel(light);
    if (channel < 0) { return vec2f(-1.0, 0.0); }
    let taps = area_shadow_taps(p, n);
    var sum = vec2f(0.0);
    var weight = 0.0;
    for (var k = 0u; k < 4u; k++) {
        if (taps[k].z <= 0.0) { continue; }
        let t = textureLoad(area_shadow_thickness_map, vec2i(taps[k].xy), 0)[channel];
        if (t < 0.0) { continue; }
        sum += taps[k].z * vec2f(t, textureLoad(area_shadow_entry, vec2i(taps[k].xy), 0)[channel]);
        weight += taps[k].z;
    }
    if (weight <= 0.0) { return vec2f(-1.0, 0.0); }
    return sum / weight;
}
