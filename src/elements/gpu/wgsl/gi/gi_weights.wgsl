// Pesos das sondas num ponto sombreado (spec 033, R6; DDGI, Majercik et al. 2019): a cascata mais fina que contém o
// ponto (com a mistura para a seguinte na última célula; fora de todas, as sondas da borda da última — nunca zero), as 8 sondas da célula com os pesos trilinear, "voltada para a
// normal" e a visibilidade de Chebyshev (a distância média e a média do quadrado na direção da sonda para o ponto) —
// o que impede a luz de atravessar paredes. Sondas desligadas (dentro da geometria) não pesam.
// Requer: gi_common, gi, gi_probe_texture, gi_visibility_atlas, gi_sampler.

/** Estado de uma sonda lido da textura das sondas: deslocamento (xyz), estado (w) e a célula (módulo 2048). */
struct GiProbeTexel {
    offset: vec4f,
    cell: vec3i,
}

fn gi_probe_texel(index: u32) -> GiProbeTexel {
    let x = (index % GI_PROBE_TEXTURE_ROW) * 2u;
    let y = index / GI_PROBE_TEXTURE_ROW;
    let a = textureLoad(gi_probe_texture, vec2u(x, y), 0);
    let b = textureLoad(gi_probe_texture, vec2u(x + 1u, y), 0);
    return GiProbeTexel(a, vec3i(round(b.xyz)));
}

/** Uma sonda que pesa no ponto. */
struct GiTap {
    index: u32,
    weight: f32,
}

/** Visibilidade de Chebyshev da sonda `index` para um ponto a `dist` na direção `dir` (da sonda para o ponto). */
fn gi_chebyshev(index: u32, dir: vec3f, dist: f32) -> f32 {
    let size = vec2f(textureDimensions(gi_visibility_atlas));
    let m = textureSampleLevel(gi_visibility_atlas, gi_sampler, gi_atlas_uv(index, dir, GI_VISIBILITY_TEXELS, size), 0.0).xy;
    if (dist <= m.x) { return 1.0; }
    let variance = abs(m.y - m.x * m.x);
    let d = dist - m.x;
    let c = variance / (variance + d * d);
    return max(c * c * c, 0.0);
}

/**
 * Fração de mistura da cascata `c` no ponto: 1 no interior da grade e até meia célula além das sondas da borda (que
 * valem sozinhas ali: a célula de fora é descartada pelo endereçamento circular), rampa até 0 na célula seguinte — a
 * cascata mais larga completa.
 */
fn gi_cascade_weight(p: vec3f, c: u32) -> f32 {
    let cas = gi_cascade(c);
    let rel = gi_grid_coord(p, c) - cas.xyz;
    let hi = vec3f(gi.grid.xyz) - 1.0;
    let inside = min(rel + 0.5, hi + 0.5 - rel);
    return clamp(min(min(inside.x, inside.y), inside.z), 0.0, 1.0);
}

/**
 * As 8 sondas da cascata `c` em volta de `p` (normal `n`, vista `v`) com os pesos normalizados (soma 1), no vetor
 * `taps`; devolve a soma bruta (0 = nenhuma sonda visível).
 */
fn gi_taps(p: vec3f, n: vec3f, v: vec3f, c: u32, taps: ptr<function, array<GiTap, 8>>) -> f32 {
    let cas = gi_cascade(c);
    let s = cas.w;
    let biased = p + (n * gi.tuning.y + v * gi.tuning.z) * s;
    let g = gi_grid_coord(biased, c);
    let base = vec3i(floor(g));
    let f = g - vec3f(base);
    // Fora da grade (só na última cascata, que vale em toda parte), as sondas da borda: a célula presa à grade.
    let lo = vec3i(floor(cas.xyz));
    let hi = lo + vec3i(gi.grid.xyz) - vec3i(1);
    var sum = 0.0;
    for (var k = 0u; k < 8u; k++) {
        let o = vec3i(i32(k & 1u), i32((k >> 1u) & 1u), i32((k >> 2u) & 1u));
        let cell = clamp(base + o, lo, hi);
        let index = gi_probe_index(gi_cell_local(cell), c);
        let state = gi_probe_texel(index);
        var w = 0.0;
        if (state.offset.w != GI_PROBE_INSIDE && all(state.cell == gi_cell_wrap(cell))) {
            let probe = gi_cell_position(cell, c) + state.offset.xyz;
            let to_probe = probe - p;
            let len_to = length(to_probe);
            let dir_to = select(n, to_probe / len_to, len_to > 1e-6);
            let wrap = (dot(dir_to, n) + 1.0) * 0.5;
            w = wrap * wrap + 0.2;
            let d = biased - probe;
            let dist = length(d);
            w *= max(gi_chebyshev(index, select(n, d / dist, dist > 1e-6), dist), 0.0);
            // Esmaga pesos muito pequenos (vazamento residual) como no DDGI.
            if (w < 0.2) { w = w * w * w * 25.0; }
            let t = mix(vec3f(1.0) - f, f, vec3f(o));
            w *= t.x * t.y * t.z;
        }
        (*taps)[k] = GiTap(index, w);
        sum += w;
    }
    if (sum > 0.0) {
        for (var k = 0u; k < 8u; k++) { (*taps)[k].weight = (*taps)[k].weight / sum; }
    }
    return sum;
}
