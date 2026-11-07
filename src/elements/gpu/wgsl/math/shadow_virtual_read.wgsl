// A visibilidade da luz pelo mapa de sombra virtual (spec 034, T060), lida do atlas do mapa que projeta (`shadow_atlas`,
// T060h: a tabela no começo e as páginas físicas depois). A penumbra pela comparação bilinear com a profundidade guardada
// (a do amostrador de comparação `less` com filtragem linear: as quatro profundidades em volta do ponto, cada uma 0 ou 1,
// pesadas pela posição).
// Requer: shadow_virtual, shadow_atlas (leitura).

/** A entrada `slot` (de `sv_slot`) da tabela. */
fn shadow_table_entry(m: ShadowMatrix, slot: vec2u) -> vec4u {
    let w = sv_table_word(m, slot);
    return vec4u(shadow_atlas[w], shadow_atlas[w + 1u], shadow_atlas[w + 2u], shadow_atlas[w + 3u]);
}

/**
 * Fração iluminada no ponto `p` (texels da página física `phys`, a borda em 0: o interior em [1, 129)) para a
 * profundidade de referência `reference`: as quatro profundidades em volta, cada uma acesa quando a referência está antes
 * dela, pesadas bilinearmente.
 */
fn shadow_page_compare(m: ShadowMatrix, phys: u32, p: vec2f, reference: f32) -> f32 {
    let x = p - 0.5;
    let base = floor(x);
    let f = x - base;
    let b = vec2i(base);
    var lit = 0.0;
    for (var k = 0u; k < 4u; k++) {
        let o = vec2i(i32(k & 1u), i32(k >> 1u));
        let t = vec2u(clamp(b + o, vec2i(0), vec2i(i32(SV_STRIDE) - 1)));
        let depth = bitcast<f32>(shadow_atlas[sv_page_word(m, phys, t)]);
        let w = mix(vec2f(1.0) - f, f, vec2f(o));
        lit += select(0.0, 1.0, reference < depth) * w.x * w.y;
    }
    return lit;
}

/**
 * Visibilidade da luz num ponto de volume (a névoa: sem superfície, normal 0) pelo mapa virtual: os pontos do volume não
 * pedem páginas finas — a busca começa dois níveis abaixo do mais grosso (a reserva no frustum), mais fina que os
 * froxels —, uma amostra deslocada dentro do texel pela sequência do antisserrilhado (o filtro temporal do volume faz a
 * média). Fora dos níveis ou sem página, 1.
 */
fn shadow_virtual_volume(
    m: ShadowMatrix,
    world_pos: vec3f,
    bias_texels: f32,
) -> f32 {
    let levels = sv_levels(m);
    if (levels == 0u) { return 1.0; }
    let p = sv_light(m, world_pos);
    var k = max(sv_level(m, p.xy), max(levels, 3u) - 3u);
    // O lado da página do nível (dobra a cada nível) calculado uma vez.
    var page = sv_page_size(m, k);
    let n = i32(m.pagesPerLevel);
    for (var i = 0u; i < 3u; i++) {
        if (k >= levels) { break; }
        let t = page / SV_PAGE;
        let q = p.xy + m.texelJitter * t;
        let g = vec2i(floor(q / page));
        let r = g - (vec2i(floor(m.camera.xy / page)) - vec2i(n / 2));
        if (all(r >= vec2i(0)) && all(r < vec2i(n))) {
            let e = shadow_table_entry(m, sv_slot(m, k, g));
            if (sv_readable(e, g)) {
                let reference = clamp(sv_depth(m, p.z, bitcast<f32>(e.w)) - bias_texels * t / (2.0 * m.depthRange), 0.0, 0.99999);
                return shadow_page_compare(m, e.z & SV_PHYS_MASK, 1.0 + (q - vec2f(g) * page) / t, reference);
            }
        }
        k++;
        page *= 2.0;
    }
    return 1.0;
}

/**
 * Visibilidade da luz no ponto `world_pos` (1 = iluminado) pelo mapa virtual: o nível do ponto, ou o primeiro mais
 * grosso com a página desenhada (a página nova ainda não desenhada usa a do nível de cima); a penumbra por PCF com
 * `samples` amostras (1, 4 ou 9: grade 1×1, 2×2 ou 3×3), girada por `m.kernelRotation` e deslocada dentro do texel por
 * `m.texelJitter` (a sequência do antisserrilhado: o acúmulo temporal faz a média); num volume (normal 0),
 * `shadow_virtual_volume`. Cada amostra acha a sua página (a
 * grade pode cruzar a borda da página); amostra em página não desenhada fica de fora da média. Os vieses em texels do
 * nível: a consulta sai do ponto pela normal `normal` (0 num volume) `normal_texels` texels, mais quanto mais rasante a
 * luz `light_dir` (unitária, do ponto para a luz), e compara com `bias_texels` texels de profundidade. Fora dos níveis,
 * 1. Laços com teto constante.
 */
fn shadow_virtual_visibility(
    m: ShadowMatrix,
    world_pos: vec3f,
    normal: vec3f,
    light_dir: vec3f,
    bias_texels: f32,
    normal_texels: f32,
    samples: u32,
) -> f32 {
    let levels = sv_levels(m);
    if (levels == 0u) { return 1.0; }
    if (all(normal == vec3f(0.0))) {
        return shadow_virtual_volume(m, world_pos, bias_texels);
    }
    let q0 = sv_light(m, world_pos).xy;
    var k = sv_level(m, q0);
    var found = false;
    for (var i = 0u; i < SV_MAX_LEVELS; i++) {
        if (k >= levels) { break; }
        let g = sv_page_of(m, k, q0);
        if (sv_in_window(m, k, g) && sv_readable(shadow_table_entry(m, sv_slot(m, k, g)), g)) {
            found = true;
            break;
        }
        k++;
    }
    if (!found) { return 1.0; }
    let t = sv_texel(m, k);
    let page = sv_page_size(m, k);
    let n_dot_l = clamp(dot(normal, light_dir), 0.0, 1.0);
    let sin_l = sqrt(max(1.0 - n_dot_l * n_dot_l, 0.0));
    let pl = sv_light(m, world_pos + normal * (normal_texels * t * (0.5 + sin_l)));
    let r = m.kernelRotation;
    let turn = mat2x2f(r.x, r.y, -r.y, r.x);
    let side = select(select(1u, 2u, samples >= 4u), 3u, samples >= 9u);
    let half = 0.5 * f32(side - 1u);
    var sum = 0.0;
    var count = 0.0;
    for (var iy = 0u; iy < 3u; iy++) {
        if (iy >= side) { break; }
        for (var ix = 0u; ix < 3u; ix++) {
            if (ix >= side) { break; }
            let q = pl.xy + (turn * (vec2f(f32(ix), f32(iy)) - half) + m.texelJitter) * t;
            let g = sv_page_of(m, k, q);
            if (!sv_in_window(m, k, g)) { continue; }
            let e = shadow_table_entry(m, sv_slot(m, k, g));
            if (!sv_readable(e, g)) { continue; }
            let reference = clamp(sv_depth(m, pl.z, bitcast<f32>(e.w)) - bias_texels * t / (2.0 * m.depthRange), 0.0, 0.99999);
            sum += shadow_page_compare(m, e.z & SV_PHYS_MASK, 1.0 + (q - vec2f(g) * page) / t, reference);
            count += 1.0;
        }
    }
    return select(1.0, sum / count, count > 0.0);
}
