// A visibilidade da luz pelo mapa de sombra virtual (spec 034, T060), lida do atlas único da cena (`shadow_atlas`, spec
// 013: as tabelas das vistas, cada uma na sua faixa, e as páginas físicas depois; a vista pela `ShadowMatrix`). A penumbra pela comparação bilinear com a profundidade guardada
// (a do amostrador de comparação `less` com filtragem linear: as quatro profundidades em volta do ponto, cada uma 0 ou 1,
// pesadas pela posição).
// Requer: constants, shadow_virtual, shadow_atlas (leitura).

/** A entrada `slot` (de `sv_slot`) da tabela da vista `m`. */
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
 * Como `shadow_page_compare`, devolvendo também a profundidade (espaço da luz, m) do bloqueador mais perto da luz entre as
 * quatro lidas (y; `z_page` é a referência da página): a estimativa da distância do ponto ao que o tapa.
 */
fn shadow_page_compare_blocker(m: ShadowMatrix, phys: u32, p: vec2f, reference: f32, z_page: f32) -> vec2f {
    let x = p - 0.5;
    let base = floor(x);
    let f = x - base;
    let b = vec2i(base);
    var lit = 0.0;
    var nearest = 1.0;
    for (var k = 0u; k < 4u; k++) {
        let o = vec2i(i32(k & 1u), i32(k >> 1u));
        let t = vec2u(clamp(b + o, vec2i(0), vec2i(i32(SV_STRIDE) - 1)));
        let depth = bitcast<f32>(shadow_atlas[sv_page_word(m, phys, t)]);
        let w = mix(vec2f(1.0) - f, f, vec2f(o));
        lit += select(0.0, 1.0, reference < depth) * w.x * w.y;
        nearest = min(nearest, depth);
    }
    return vec2f(lit, (nearest - 0.5) * 2.0 * m.depthRange + z_page);
}

/**
 * Visibilidade da luz num ponto de volume (a névoa, o ar: sem superfície, normal 0) pelo mapa virtual: os pontos do
 * volume não pedem páginas finas — a busca começa dois níveis abaixo do mais grosso (a reserva no frustum), mais fina
 * que os froxels —, uma amostra deslocada dentro do texel pela sequência do antisserrilhado (o filtro temporal do volume
 * faz a média). A penumbra do disco da luz (raio angular `angular_radius`, rad; spec 041 R21): com um bloqueador entre
 * as quatro profundidades lidas, a meia largura dela no ponto é (z do ponto − z do bloqueador) × tan do raio angular; se
 * passa de meio texel, a amostra vai a um ponto do disco dela (a sequência do quadro, girada) — o filtro temporal do
 * volume faz a média no disco (PCSS de uma amostra por quadro). O bloqueador é procurado só no texel do ponto: do lado
 * aceso, a penumbra vai até um texel da borda. Fora dos níveis ou sem página, 1.
 */
fn shadow_virtual_volume(
    m: ShadowMatrix,
    world_pos: vec3f,
    bias_texels: f32,
    angular_radius: f32,
) -> f32 {
    let levels = sv_levels(m);
    if (levels == 0u) { return 1.0; }
    let p = sv_light(m, world_pos);
    // Fora do tronco da vista em perspectiva (antes do plano próximo, além do alcance): sem sombra dela.
    if (m.kind == 1u && (p.z < m.near || p.z > m.far)) { return 1.0; }
    let scale = sv_metres(m, p.z);
    let size = sv_source_size(m, angular_radius);
    var k = max(sv_level_at(m, world_pos, p), max(levels, 3u) - 3u);
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
                let z0 = bitcast<f32>(e.w);
                let reference = clamp(sv_depth(m, p.z, z0) - bias_texels * t * scale / (2.0 * m.depthRange), 0.0, 0.99999);
                let c = shadow_page_compare_blocker(m, e.z & SV_PHYS_MASK, 1.0 + (q - vec2f(g) * page) / t, reference, z0);
                let radius = sv_cone(m, size, max(p.z - bias_texels * t * scale - c.y, 0.0), p.z, c.y);
                if (radius <= 0.5 * t) { return c.x; }
                let rot = m.kernelRotation;
                let o = mat2x2f(rot.x, rot.y, -rot.y, rot.x) * sv_concentric(clamp(m.texelJitter * 2.0, vec2f(-1.0), vec2f(1.0))) * radius;
                let q2 = p.xy + o;
                let g2 = sv_page_of(m, k, q2);
                if (!sv_in_window(m, k, g2)) { return c.x; }
                let e2 = shadow_table_entry(m, sv_slot(m, k, g2));
                if (!sv_readable(e2, g2)) { return c.x; }
                let reference2 = clamp(sv_depth(m, p.z, bitcast<f32>(e2.w)) - bias_texels * t * scale / (2.0 * m.depthRange), 0.0, 0.99999);
                return shadow_page_compare(m, e2.z & SV_PHYS_MASK, 1.0 + (q2 - vec2f(g2) * page) / t, reference2);
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
fn sv_receiver_slope(m: ShadowMatrix, normal: vec3f, pl: vec3f) -> vec2f {
    let nl = (m.lightView * vec4f(normal, 0.0)).xyz;
    if (m.kind == 1u) {
        // Na vista em perspectiva o plano receptor é z(q) = c / (n · (q · tan, 1)): dz/dq = −z · tan · n.xy / (n · (q · tan, 1)).
        let along = dot(nl, vec3f(pl.xy * m.origin.w, 1.0));
        let d = select(min(along, -0.0872), max(along, 0.0872), along >= 0.0);
        return -pl.z * m.origin.w * nl.xy / d;
    }
    let nz = select(min(nl.z, -0.0872), max(nl.z, 0.0872), nl.z >= 0.0);
    return -nl.xy / nz;
}

/**
 * O tamanho da fonte para a penumbra, de `size`: na vista ortográfica (a luz direcional), a tangente do raio angular
 * do disco (`size` em rad); na em perspectiva (a luz local), o raio da fonte em metros.
 */
fn sv_source_size(m: ShadowMatrix, size: f32) -> f32 {
    return select(tan(max(size, 0.0)), max(size, 0.0), m.kind == 1u);
}

/**
 * A meia largura, no plano da vista, do que a fonte de tamanho `spread` (`sv_source_size`) cobre atrás de um bloqueador
 * a `gap` metros (ao longo do eixo) do receptor de profundidade `z_receiver`, com o bloqueador em `z_blocker`: na vista
 * ortográfica, gap × tan θ (m); na em perspectiva, raio × gap / z do bloqueador (triângulos semelhantes a partir da
 * fonte), levado às coordenadas do tronco no receptor.
 */
fn sv_cone(m: ShadowMatrix, spread: f32, gap: f32, z_receiver: f32, z_blocker: f32) -> f32 {
    if (m.kind == 1u) {
        return spread * gap / (max(z_blocker, m.near) * max(z_receiver, m.near) * m.origin.w);
    }
    return spread * gap;
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
    let scale = sv_metres(m, pl.z);
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
        let gap = pl.z + dot(slope, o) - bias_texels * t * scale - blocker;
        if (gap > 0.0 && length(o) <= sv_cone(m, spread, gap, pl.z, blocker) + t) {
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
 *
 * Na vista em perspectiva (a luz de foco, a face da pontual; spec 013, R4) a conta é a mesma no plano do tronco: o nível
 * pela resolução na tela, a profundidade linear ao longo do eixo, e os vieses e a penumbra escalados pela distância (o
 * texel em metros é o do plano pela profundidade e a tangente; `angular_radius` é o raio da fonte em metros — 0: a borda
 * do texel). Fora do tronco (antes do plano próximo, além do alcance, fora da abertura), 1.
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
        return shadow_virtual_volume(m, world_pos, bias_texels, angular_radius);
    }
    let l0 = sv_light(m, world_pos);
    // Fora do tronco da vista em perspectiva (antes do plano próximo, além do alcance): sem sombra dela.
    if (m.kind == 1u && (l0.z < m.near || l0.z > m.far)) { return 1.0; }
    // Na vista em perspectiva o ponto na borda do tronco (a aresta entre duas faces do cubo) conta como dentro dele.
    let q0 = select(l0.xy, clamp(l0.xy, vec2f(-0.99999), vec2f(0.99999)), m.kind == 1u);
    let k0 = sv_readable_level(m, sv_level_at(m, world_pos, l0), q0);
    if (k0 >= levels) { return 1.0; }
    let t0 = sv_texel(m, k0);
    let n_dot_l = clamp(dot(normal, light_dir), 0.0, 1.0);
    let sin_l = sqrt(max(1.0 - n_dot_l * n_dot_l, 0.0));
    let pl = sv_light(m, world_pos + normal * (normal_texels * t0 * sv_metres(m, l0.z) * (0.5 + sin_l)));
    let slope = sv_receiver_slope(m, normal, pl);
    // Metros por unidade do plano da vista no receptor (1 na ortográfica).
    let scale = sv_metres(m, pl.z);
    let r = m.kernelRotation;
    let turn = mat2x2f(r.x, r.y, -r.y, r.x);
    // A meia largura da penumbra (no plano da vista) pelo tamanho da fonte — o disco da luz direcional, o raio da luz
    // local; sem ele, a do texel.
    let spread = sv_source_size(m, angular_radius);
    var penumbra = 0.0;
    if (spread > 0.0) {
        // A maior penumbra possível: o bloqueador do outro lado da faixa de profundidade (na vista em perspectiva, no
        // plano próximo).
        let reach = select(spread * 2.0 * m.depthRange, sv_cone(m, spread, pl.z, pl.z, m.near), m.kind == 1u);
        let b = sv_blockers(m, k0, pl, slope, spread, reach, turn, bias_texels);
        if (b.y == 0.0) { return 1.0; }
        penumbra = sv_cone(m, spread, max(pl.z - b.x, 0.0), pl.z, b.x);
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
            let reference = clamp(sv_depth(m, z, bitcast<f32>(e.w)) - bias_texels * t * scale / (2.0 * m.depthRange), 0.0, 0.99999);
            sum += shadow_page_compare(m, e.z & SV_PHYS_MASK, 1.0 + (q - vec2f(g) * page) / t, reference);
            count += 1.0;
        }
    }
    return select(1.0, sum / count, count > 0.0);
}

/**
 * A vista de `base` que vale para o ponto `world_pos` afastado da superfície por `shift` (o afastamento da consulta,
 * ao longo da normal, em texels do nível do ponto): no referencial de uma vista, ele mesmo; no de seis (a luz pontual: as
 * faces do cubo em volta dela; spec 013), a face da direção da luz ao ponto já afastado — para a consulta não cair fora
 * da face na aresta entre duas.
 */
fn sv_point_view(base: ShadowMatrix, world_pos: vec3f, shift: vec3f) -> ShadowMatrix {
    if (base.views <= 1u) { return base; }
    let near = sv_face(base, sv_cube_face(world_pos - base.origin.xyz));
    let l = sv_light(near, world_pos);
    let k = sv_level_at(near, world_pos, l);
    let moved = world_pos + shift * (sv_texel(near, k) * sv_metres(near, l.z));
    return sv_face(base, sv_cube_face(moved - base.origin.xyz));
}

/**
 * Visibilidade da luz no ponto `world_pos` pelo mapa de sombra de referencial `base`, de qualquer tipo de vista (a
 * direcional, a de foco e as seis faces da pontual): escolhe a vista (`sv_point_view`) e lê nela
 * (`shadow_virtual_visibility`) — uma chamada só da leitura, qualquer que seja a luz. Na pontual, as amostras do filtro
 * que passam da aresta entre duas faces ficam de fora da média.
 */
fn shadow_light_visibility(
    base: ShadowMatrix,
    world_pos: vec3f,
    normal: vec3f,
    light_dir: vec3f,
    bias_texels: f32,
    normal_texels: f32,
    samples: u32,
    size: f32,
) -> f32 {
    if (sv_levels(base) == 0u) { return 1.0; }
    // O afastamento da consulta: até 1,5 texel do nível do ponto, pela normal.
    let m = sv_point_view(base, world_pos, normal * (normal_texels * 1.5));
    return shadow_virtual_visibility(m, world_pos, normal, light_dir, bias_texels, normal_texels, samples, size);
}
