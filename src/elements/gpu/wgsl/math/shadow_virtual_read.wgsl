// A visibilidade da luz pelo mapa de sombra virtual (spec 034, T060), lida do atlas do mapa que projeta (`shadow_atlas`,
// T060h: a tabela no começo e as páginas físicas depois). A penumbra pela comparação bilinear com a profundidade guardada
// (a do amostrador de comparação `less` com filtragem linear: as quatro profundidades em volta do ponto, cada uma 0 ou 1,
// pesadas pela posição).
// Requer: constants, shadow_virtual, shadow_atlas (leitura).

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

/** Primeiro nível desde `first` com a página de `q` desenhada (na janela); `levels` se nenhum. */
fn sv_readable_level(m: ShadowMatrix, first: u32, q: vec2f) -> u32 {
    let levels = sv_levels(m);
    var k = first;
    for (var i = 0u; i < SV_MAX_LEVELS; i++) {
        if (k >= levels) { break; }
        let g = sv_page_of(m, k, q);
        if (sv_in_window(m, k, g) && sv_readable(shadow_table_entry(m, sv_slot(m, k, g)), g)) { return k; }
        k++;
    }
    return levels;
}

/**
 * Inclinação da profundidade da luz no plano receptor (Isidoro 2006, sem derivadas de tela: pela normal `normal` no
 * espaço da luz): dz por unidade de x e de y do plano da luz, com o rasante limitado a 85°.
 */
fn sv_receiver_slope(m: ShadowMatrix, normal: vec3f) -> vec2f {
    let nl = (m.lightView * vec4f(normal, 0.0)).xyz;
    let nz = select(min(nl.z, -0.0872), max(nl.z, 0.0872), nl.z >= 0.0);
    return -nl.xy / nz;
}

/** O quadrado [-1, 1]² no disco unitário, preservando as áreas (o mapa concêntrico de Shirley e Chiu 1997). */
fn sv_concentric(u: vec2f) -> vec2f {
    if (all(u == vec2f(0.0))) { return vec2f(0.0); }
    let quarter = 0.25 * PI;
    if (abs(u.x) > abs(u.y)) {
        let a = quarter * (u.y / u.x);
        return u.x * vec2f(cos(a), sin(a));
    }
    let a = 2.0 * quarter - quarter * (u.x / u.y);
    return u.y * vec2f(cos(a), sin(a));
}

/** Anéis da busca dos bloqueadores (o raio dobra a cada um, desde 2 texels: 256 no último) e amostras por anel. */
const SV_BLOCKER_RINGS: u32 = 8u;
const SV_BLOCKER_RING_SAMPLES: u32 = 8u;

/**
 * Profundidade média (espaço da luz) dos bloqueadores do disco da luz sobre `pl`, no nível `k` do receptor: o centro e
 * anéis de 8 amostras (girados por `turn` e pela sequência do quadro) com o raio dobrando desde 2 texels, até passar da
 * maior penumbra possível `reach` (m). Uma amostra a `o` do ponto é bloqueador só se está à frente do plano receptor
 * `slope` e cobre parte do disco: |o| ≤ `spread` × (z do receptor − z dela). y = quantos (0: nenhum; o z pode ser
 * negativo).
 */
fn sv_blockers(m: ShadowMatrix, k: u32, pl: vec3f, slope: vec2f, spread: f32, reach: f32, turn: mat2x2f, bias_texels: f32) -> vec2f {
    let t = sv_texel(m, k);
    let page = sv_page_size(m, k);
    var z = 0.0;
    var count = 0.0;
    var r = 0.0;
    for (var i = 0u; i < 1u + SV_BLOCKER_RING_SAMPLES * SV_BLOCKER_RINGS; i++) {
        let ring = select((i - 1u) / SV_BLOCKER_RING_SAMPLES, 0u, i == 0u);
        r = select(2.0 * t * exp2(f32(ring)), 0.0, i == 0u);
        if (r > reach + 2.0 * t) { break; }
        let a = TAU * (f32(i % SV_BLOCKER_RING_SAMPLES) / f32(SV_BLOCKER_RING_SAMPLES) + f32(ring) * 0.381966);
        let o = turn * (vec2f(cos(a), sin(a)) * r + m.texelJitter * t);
        let q = pl.xy + o;
        let g = sv_page_of(m, k, q);
        if (!sv_in_window(m, k, g)) { continue; }
        let e = shadow_table_entry(m, sv_slot(m, k, g));
        if (!sv_readable(e, g)) { continue; }
        let tx = vec2u(clamp(vec2i(floor(1.0 + (q - vec2f(g) * page) / t)), vec2i(0), vec2i(i32(SV_STRIDE) - 1)));
        let d = bitcast<f32>(shadow_atlas[sv_page_word(m, e.z & SV_PHYS_MASK, tx)]);
        let blocker = (d - 0.5) * 2.0 * m.depthRange + bitcast<f32>(e.w);
        let gap = pl.z + dot(slope, o) - bias_texels * t - blocker;
        if (gap > 0.0 && length(o) <= spread * gap + t) {
            z += blocker;
            count += 1.0;
        }
    }
    return vec2f(z / max(count, 1.0), count);
}

/**
 * Visibilidade da luz no ponto `world_pos` (1 = iluminado) pelo mapa virtual. Num volume (normal 0),
 * `shadow_virtual_volume`. Na superfície, PCSS (Fernando 2005) com o disco da luz de raio angular `angular_radius` (rad;
 * 0 = uma direção, a penumbra do texel): os bloqueadores procurados em anéis que dobram de raio até a maior penumbra
 * possível (a faixa de profundidade do mapa × tan do raio angular; `sv_blockers`), a meia largura da penumbra (z do receptor − z médio dos bloqueadores) ×
 * tan do raio angular, e o filtro PCF de `samples` amostras (1, 4 ou 9: grade 1×1, 2×2 ou 3×3) no disco dela, no nível
 * do receptor (a página nova ainda não desenhada usa a do nível de cima). A grade girada por
 * `m.kernelRotation` e deslocada por `m.texelJitter` (a sequência do antisserrilhado: o acúmulo temporal faz a média).
 * Cada amostra acha a sua página e compara com a profundidade do plano receptor no ponto dela; amostra em página não
 * desenhada fica de fora da média. Os vieses em texels do nível: a consulta sai do ponto pela normal `normal`
 * `normal_texels` texels, mais quanto mais rasante a luz `light_dir` (unitária, do ponto para a luz), e compara com
 * `bias_texels` texels de profundidade. Fora dos níveis, 1. Laços com teto constante.
 */
fn shadow_virtual_visibility(
    m: ShadowMatrix,
    world_pos: vec3f,
    normal: vec3f,
    light_dir: vec3f,
    bias_texels: f32,
    normal_texels: f32,
    samples: u32,
    angular_radius: f32,
) -> f32 {
    let levels = sv_levels(m);
    if (levels == 0u) { return 1.0; }
    if (all(normal == vec3f(0.0))) {
        return shadow_virtual_volume(m, world_pos, bias_texels);
    }
    let q0 = sv_light(m, world_pos).xy;
    let k0 = sv_readable_level(m, sv_level(m, q0), q0);
    if (k0 >= levels) { return 1.0; }
    let t0 = sv_texel(m, k0);
    let n_dot_l = clamp(dot(normal, light_dir), 0.0, 1.0);
    let sin_l = sqrt(max(1.0 - n_dot_l * n_dot_l, 0.0));
    let pl = sv_light(m, world_pos + normal * (normal_texels * t0 * (0.5 + sin_l)));
    let slope = sv_receiver_slope(m, normal);
    let r = m.kernelRotation;
    let turn = mat2x2f(r.x, r.y, -r.y, r.x);
    // A meia largura da penumbra (m) pelo disco da luz; sem disco, a do texel.
    let spread = tan(max(angular_radius, 0.0));
    var penumbra = 0.0;
    if (spread > 0.0) {
        let b = sv_blockers(m, k0, pl, slope, spread, spread * 2.0 * m.depthRange, turn, bias_texels);
        if (b.y == 0.0) { return 1.0; }
        penumbra = max(pl.z - b.x, 0.0) * spread;
    }
    // O filtro no nível do receptor (o mais fino desenhado nele): as páginas dos outros níveis dependem do que os pixels
    // pediram, e o nível mudaria de um lado da borda para o outro.
    let k = k0;
    let t = sv_texel(m, k);
    let page = sv_page_size(m, k);
    let side = select(select(1u, 2u, samples >= 4u), 3u, samples >= 9u);
    let half = 0.5 * f32(side - 1u);
    // Penumbra maior que o texel: as amostras uniformes no disco de raio `penumbra` (a projeção do disco da luz; a grade
    // em células que cobrem [-1, 1]², deslocadas pela sequência do quadro, levadas ao disco pelo mapa concêntrico);
    // senão, a grade de um texel.
    let disc = penumbra > t;
    var sum = 0.0;
    var count = 0.0;
    for (var iy = 0u; iy < 3u; iy++) {
        if (iy >= side) { break; }
        for (var ix = 0u; ix < 3u; ix++) {
            if (ix >= side) { break; }
            let cell = vec2f(f32(ix), f32(iy)) - half + m.texelJitter;
            let o = select(
                (turn * (vec2f(f32(ix), f32(iy)) - half) + m.texelJitter) * t,
                turn * sv_concentric(cell * (2.0 / f32(side))) * penumbra,
                disc,
            );
            let q = pl.xy + o;
            let g = sv_page_of(m, k, q);
            if (!sv_in_window(m, k, g)) { continue; }
            let e = shadow_table_entry(m, sv_slot(m, k, g));
            if (!sv_readable(e, g)) { continue; }
            let z = pl.z + dot(slope, o);
            let reference = clamp(sv_depth(m, z, bitcast<f32>(e.w)) - bias_texels * t / (2.0 * m.depthRange), 0.0, 0.99999);
            sum += shadow_page_compare(m, e.z & SV_PHYS_MASK, 1.0 + (q - vec2f(g) * page) / t, reference);
            count += 1.0;
        }
    }
    return select(1.0, sum / count, count > 0.0);
}
