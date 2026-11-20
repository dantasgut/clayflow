// A sombra das nuvens num ponto do ar (spec 041, R21): contribuição ao ponto `light_volume_visibility` — os froxels
// acumulam no tempo, e uma amostra por quadro basta onde a superfície (`light_transmission`) faz a média: um ponto do disco
// da penumbra (o raio dela pela distância ao meio do trecho da casca na coluna, × o raio angular do sol), um dos dois
// níveis da mistura (pela fração dela), na troca de degrau um dos dois mapas (pelo peso) e um texel do par bilinear (pelos pesos dele), sorteados pela sequência R2 do
// quadro deslocada pelo hash do ponto — a média temporal de `e^(−τ)` dessas amostras é a média da penumbra no disco, sem
// o viés de Jensen. Duas leituras; a superfície faz até 72.
// Requer: sky, clouds, random, cloud_shadow_lookup.

fn light_volume_visibility(light: u32, p: vec3f) -> vec3f {
    if (light != sky.sunSlot) { return vec3f(1.0); }
    let c = cloud_shadow_column_far(p);
    if (c.len <= 0.0) { return vec3f(1.0); }
    let kn = clamp(c.knot, 0.0, CLOUD_SHADOW_LOOKUP_KNOTS);
    let k = min(u32(floor(kn)), 15u);
    let f = kn - f32(k);
    let seed = hash2(vec2u(bitcast<u32>(p.x) ^ hash2(vec2u(bitcast<u32>(p.y), 0u)), bitcast<u32>(p.z)));
    let h0 = vec2f(f32(seed >> 8u), f32(pcg_hash(seed) >> 8u)) / 16777216.0;
    let n = f32(clouds.march.z);
    let h = fract(h0 + n * vec2f(0.7548776662, 0.5698402910));
    let h2 = fract(h.yx * 7.0 + h0.yx);
    // A distância ao bloqueador: do meio do trecho da casca percorrido até o ponto (o centro de τ sem os nós).
    let dist = max(c.knot - 0.5 * kn, 0.0) / CLOUD_SHADOW_LOOKUP_KNOTS * c.len;
    let r = dist * tan(sky.sunIlluminance.w);
    let o = r * sqrt(h.x) * vec2f(cos(TAU * h.y), sin(TAU * h.y));
    // Na troca de degrau, um dos dois mapas pelo peso (a média temporal mistura os dois como a superfície).
    let use_leaving = c.other > 0.0 && fract(h0.x + h0.y + n * 0.6180339887) < c.other;
    var pa = c.pa;
    var pb = c.pb;
    if (use_leaving) {
        pa = c.qa;
        pb = c.qb;
    }
    var uv = cloud_shadow_page_uv(p, pa, c.level, o);
    if (c.blend > 0.0 && h2.x < c.blend) { uv = cloud_shadow_page_uv(p, pb, c.level + 1u, o); }
    let t = vec2i(floor(uv * CLOUD_SHADOW_ATLAS - 0.5 + h2));
    let tau = mix(cloud_shadow_knot_texel(t, k), cloud_shadow_knot_texel(t, k + 1u), f);
    return vec3f(exp(-tau));
}
