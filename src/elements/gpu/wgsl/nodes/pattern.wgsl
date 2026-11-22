// Nós de padrão procedural (spec 038): o xadrez em 2D e em 3D sobre `q = p·scale + offset`, avaliado por pixel. O valor
// (0 nas casas pares, 1 nas ímpares) é a média da onda quadrada sobre a largura do pixel em células (`width·scale`, o
// filtro de caixa analítico: a integral da onda quadrada é uma onda triangular) — ao longe, onde a casa fica menor que o
// pixel, o padrão vai à média (0,5) em vez de cintilar. `width` 0: o xadrez exato.
//
// Padrões com relevo (spec 011): a trama de tecido, as células com sulcos, os anéis de crescimento e o grão — sobre a
// coordenada `p` de `surface.uvSpace`, cada um com a altura e o gradiente analítico dela (∂/∂p, a entrada de
// `surface.bump`). `width` é a largura do pixel em `p`: o detalhe menor que o pixel vai à média (fator
// `node_pattern_band`), o gradiente a zero. `wrap` é o período de `p` por eixo (0 = sem): a frequência é ajustada para
// um número inteiro de células por período e o índice da célula dá a volta — sem emenda onde o uv fecha.
// Requer: noise (o hash PCG).

/** A onda quadrada (±1, período 2) média sobre [q − w/2, q + w/2], por eixo; exata com `w` abaixo de 1e-4. */
fn node_pattern_square(q: vec3f, w: vec3f) -> vec3f {
    let exact = select(vec3f(-1.0), vec3f(1.0), fract(q * 0.5) < vec3f(0.5));
    let safe = max(w, vec3f(1e-4));
    let filtered = 2.0 * (abs(fract((q - 0.5 * safe) * 0.5) - 0.5) - abs(fract((q + 0.5 * safe) * 0.5) - 0.5)) / safe;
    return select(filtered, exact, w < vec3f(1e-4));
}

fn node_pattern_checker2(p: vec2f, width: f32, scale: f32, offset: vec2f) -> f32 {
    let s = node_pattern_square(vec3f(p * scale + offset, 0.5), vec3f(vec2f(max(width, 0.0) * abs(scale)), 0.0));
    return 0.5 - 0.5 * s.x * s.y;
}

fn node_pattern_checker3(p: vec3f, width: f32, scale: f32, offset: vec3f) -> f32 {
    let s = node_pattern_square(p * scale + offset, vec3f(max(width, 0.0) * abs(scale)));
    return 0.5 - 0.5 * s.x * s.y * s.z;
}

// ── Padrões com relevo (spec 011) ────────────────────────────────────────────────────────────────────────────────

struct NodePatternGrain {
    value: f32,
    gradient: vec2f,
}

struct NodePatternCells {
    height: f32,
    gradient: vec2f,
    cell: f32,
    random: vec2f,
}

struct NodePatternCellPoint {
    r: vec2f,
    h: u32,
}

struct NodePatternRings {
    value: f32,
    gradient: vec2f,
    ring: f32,
}

struct NodePatternWeave {
    height: f32,
    gradient: vec2f,
    warp: f32,
    thread: f32,
    gap: f32,
}

// Fator do detalhe pela largura do pixel em células (`w`): 1 abaixo de 0,2 célula por pixel, 0 acima de 0,5 (duas
// amostras por célula, o limite de Nyquist: um padrão de bordas vivas que se repete faria moiré acima dele).
fn node_pattern_band(w: f32) -> f32 {
    return 1.0 - smoothstep(0.2, 0.5, w);
}

// Frequência ajustada ao período: (frequência, células por período) — `n` células inteiras, múltiplo de `step`, em
// `wrap`; sem período (`wrap` ≤ 0), (`scale`, 0).
fn node_pattern_fit(scale: f32, wrap: f32, step: f32) -> vec2f {
    if (wrap <= 0.0) { return vec2f(scale, 0.0); }
    let n = max(round(scale * wrap / step), 1.0) * step;
    return vec2f(n / wrap, n);
}

// Índice u32 da célula `i` (inteiro em f32), reduzido módulo `n` quando há período (`n` > 0).
fn node_pattern_index(i: f32, n: f32) -> u32 {
    if (n > 0.0) { return u32(i - n * floor(i / n)); }
    return bitcast<u32>(i32(i));
}

// Hash da célula `i` com período `per` por eixo e a semente.
fn node_pattern_hash(i: vec2f, per: vec2f, seed: u32) -> u32 {
    return hash2(vec2u(node_pattern_index(i.x, per.x), node_pattern_index(i.y, per.y))
        + seed * vec2u(0x9e3779b1u, 0x85ebca77u));
}

// Uma das 8 direções do plano (eixos e diagonais) pelos 3 bits baixos do hash — as do ruído de gradiente da biblioteca.
fn node_pattern_dir(h: u32) -> vec2f {
    let k = h & 7u;
    let d = select(1.0, 0.70710678, k >= 4u);
    let sx = select(1.0, -1.0, (k & 1u) == 1u);
    if (k < 2u) { return vec2f(sx, 0.0); }
    if (k < 4u) { return vec2f(0.0, sx); }
    return vec2f(sx * d, select(d, -d, k >= 6u));
}

// Ruído de gradiente 2D em `q` com a derivada analítica: (valor em [-1, 1], ∂/∂q.x, ∂/∂q.y); interpolação quíntica,
// célula com período `per` por eixo.
fn node_pattern_noise(q: vec2f, per: vec2f, seed: u32) -> vec3f {
    let i = floor(q);
    let f = q - i;
    let ga = node_pattern_dir(node_pattern_hash(i, per, seed));
    let gb = node_pattern_dir(node_pattern_hash(i + vec2f(1.0, 0.0), per, seed));
    let gd = node_pattern_dir(node_pattern_hash(i + vec2f(0.0, 1.0), per, seed));
    let ge = node_pattern_dir(node_pattern_hash(i + vec2f(1.0, 1.0), per, seed));
    let a = dot(ga, f);
    let b = dot(gb, f - vec2f(1.0, 0.0));
    let d = dot(gd, f - vec2f(0.0, 1.0));
    let e = dot(ge, f - vec2f(1.0, 1.0));
    let u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
    let du = 30.0 * f * f * (f * (f - 2.0) + 1.0);
    let value = mix(mix(a, b, u.x), mix(d, e, u.x), u.y);
    let grad = mix(mix(ga, gb, u.x), mix(gd, ge, u.x), u.y)
        + vec2f(du.x * mix(b - a, e - d, u.y), du.y * (mix(d, e, u.x) - mix(a, b, u.x)));
    return 1.41421356 * vec3f(value, grad);
}

/**
 * Grão (spec 011): `octaves` (1 a 8) oitavas do ruído de gradiente 2D com frequências por eixo `scale` (anisotrópico:
 * `scale` (2, 200) dá riscos ao longo de x — a escova do metal, a fibra da madeira), × `lacunarity` e amplitude × `gain`
 * a cada oitava, semente + k; normalizado pela soma das amplitudes. Saídas: o valor em [-1, 1] e o gradiente ∂/∂p.
 */
fn node_pattern_grain(p: vec2f, width: f32, wrap: vec2f, scale: vec2f, seed: u32, octaves: u32, lacunarity: f32,
    gain: f32) -> NodePatternGrain {
    var freq = scale;
    var amp = 1.0;
    var norm = 0.0;
    var sum = vec3f(0.0);
    let n = clamp(octaves, 1u, 8u);
    for (var k = 0u; k < n; k++) {
        let fx = node_pattern_fit(freq.x, wrap.x, 1.0);
        let fy = node_pattern_fit(freq.y, wrap.y, 1.0);
        let fr = vec2f(fx.x, fy.x);
        let v = node_pattern_noise(p * fr, vec2f(fx.y, fy.y), seed + k);
        let band = select(1.0, node_pattern_band(width * max(abs(fr.x), abs(fr.y))), width > 0.0);
        sum += amp * band * vec3f(v.x, v.yz * fr);
        norm += amp;
        amp *= gain;
        freq *= lacunarity;
    }
    return NodePatternGrain(sum.x / norm, sum.yz / norm);
}

// O ponto da célula `i + o` relativo à posição `f` dentro da célula `i`: o centro deslocado por `jitter`; e o hash dela.
fn node_pattern_cell_point(i: vec2f, o: vec2f, f: vec2f, per: vec2f, seed: u32, jitter: f32) -> NodePatternCellPoint {
    let h = node_pattern_hash(i + o, per, seed);
    let j = 0.5 * vec2f(hash_signed(h), hash_signed(pcg_hash(h)));
    return NodePatternCellPoint(o + vec2f(0.5) + jitter * j - f, h);
}

/**
 * Células (spec 011): Voronoi 2D de `scale` células por unidade de `p`, um ponto por célula no centro deslocado por
 * `jitter` (0 = grade, 1 = a célula inteira). `height` = smoothstep(0, `crease`, distância à borda da célula) — 0 no
 * sulco entre as células, 1 no platô (o grão do couro, os poros) —, com o gradiente ∂/∂p; `cell` o valor em [0, 1] da
 * célula e `random` dois valores em [-1, 1] dela (a inclinação de um floco). A distância à borda é a exata (a mediatriz
 * com cada vizinha, 5 × 5 células em volta da mais próxima). Abaixo do pixel: altura à média (1 − `crease`), `cell` a
 * 0,5, gradiente e `random` a zero.
 */
fn node_pattern_cells(p: vec2f, width: f32, wrap: vec2f, scale: f32, jitter: f32, crease: f32, seed: u32)
    -> NodePatternCells {
    let fx = node_pattern_fit(scale, wrap.x, 1.0);
    let fy = node_pattern_fit(scale, wrap.y, 1.0);
    let fr = vec2f(fx.x, fy.x);
    let per = vec2f(fx.y, fy.y);
    let q = p * fr;
    let i = floor(q);
    let f = q - i;
    var best = 1e30;
    var r1 = vec2f(0.0);
    var o1 = vec2f(0.0);
    var h1 = 0u;
    for (var dy = -1; dy <= 1; dy++) {
        for (var dx = -1; dx <= 1; dx++) {
            let o = vec2f(f32(dx), f32(dy));
            let c = node_pattern_cell_point(i, o, f, per, seed, jitter);
            let d = dot(c.r, c.r);
            if (d < best) {
                best = d;
                r1 = c.r;
                o1 = o;
                h1 = c.h;
            }
        }
    }
    var edge = 1e30;
    var nrm = vec2f(0.0);
    for (var dy = -2; dy <= 2; dy++) {
        for (var dx = -2; dx <= 2; dx++) {
            if (dx == 0 && dy == 0) { continue; }
            let c = node_pattern_cell_point(i, o1 + vec2f(f32(dx), f32(dy)), f, per, seed, jitter);
            let dr = c.r - r1;
            let l2 = dot(dr, dr);
            if (l2 > 1e-12) {
                let dn = dr * inverseSqrt(l2);
                let d = dot(0.5 * (r1 + c.r), dn);
                if (d < edge) {
                    edge = d;
                    nrm = dn;
                }
            }
        }
    }
    let cw = max(crease, 1e-4);
    let t = clamp(edge / cw, 0.0, 1.0);
    let k = select(1.0, node_pattern_band(width * max(abs(fr.x), abs(fr.y))), width > 0.0);
    let h2 = pcg_hash(h1);
    return NodePatternCells(
        mix(1.0 - min(cw, 1.0), t * t * (3.0 - 2.0 * t), k),
        k * (6.0 * t * (1.0 - t) / cw) * (-nrm) * fr,
        mix(0.5, f32(h1 >> 8u) / 16777215.0, k),
        k * vec2f(hash_signed(h2), hash_signed(pcg_hash(h2))),
    );
}

/**
 * Anéis de crescimento (spec 011): o corte de um tronco de eixo ao longo de `p.x` (a direção da fibra), com a medula em
 * `p.y` = 0 a `depth` do plano do corte. O raio r = √(y² + z²) + `waviness` · ruído(p · `waviness_scale`), z = `depth` +
 * `distortion` · ruído(p · `distortion_scale`) (a profundidade do corte varia ao longo da tábua: os arcos da "catedral"
 * onde ela passa perto da medula; a ondulação do raio entorta as linhas também longe dela); `scale` anéis por unidade
 * de raio em média — a posição em anéis s = r · `scale` + `irregularity` · ruído(0,1875 · r · `scale`): anos largos e
 * estreitos (`irregularity` em [0, 1]: s segue crescente com r). `value` em [0, 1] é o perfil do anel: sobe devagar do
 * lenho inicial (0) ao tardio (1, a faixa escura e dura) e cai de volta no fim — smoothstep(0; 0,7; t) · (1 −
 * smoothstep(0,88; 1; t)), t = fract(s) —, com o gradiente ∂/∂p; `ring` o valor em [0, 1] do anel (a variação de tom
 * de ano para ano). Abaixo do pixel: o perfil à média (0,59), `ring` a 0,5, gradiente a zero.
 */
fn node_pattern_rings(p: vec2f, width: f32, wrap: vec2f, scale: f32, depth: f32, distortion: f32,
    distortion_scale: vec2f, seed: u32, irregularity: f32, waviness: f32, waviness_scale: vec2f) -> NodePatternRings {
    let fx = node_pattern_fit(distortion_scale.x, wrap.x, 1.0);
    let fr = vec2f(fx.x, distortion_scale.y);
    let nz = node_pattern_noise(p * fr, vec2f(fx.y, 0.0), seed);
    let z = depth + distortion * nz.x;
    let wx = node_pattern_fit(waviness_scale.x, wrap.x, 1.0);
    let wr = vec2f(wx.x, waviness_scale.y);
    let nw = node_pattern_noise(p * wr, vec2f(wx.y, 0.0), seed + 1u);
    let r0 = max(sqrt(p.y * p.y + z * z), 1e-6);
    let r = max(r0 + waviness * nw.x, 1e-6);
    let dr = (vec2f(0.0, p.y) + z * distortion * nz.yz * fr) / r0 + waviness * nw.yz * wr;
    let s0 = r * scale;
    let irr = clamp(irregularity, 0.0, 1.0);
    let ni = node_pattern_noise(vec2f(s0 * 0.1875, 0.5), vec2f(0.0), seed + 2u);
    let s = s0 + irr * ni.x;
    let ds = scale * (1.0 + irr * 0.1875 * ni.y);
    let ring = floor(s);
    let t = s - ring;
    let ta = clamp(t / 0.7, 0.0, 1.0);
    let tb = clamp((t - 0.88) / 0.12, 0.0, 1.0);
    let a = ta * ta * (3.0 - 2.0 * ta);
    let b = 1.0 - tb * tb * (3.0 - 2.0 * tb);
    let dv = (6.0 * ta * (1.0 - ta) / 0.7) * b - a * (6.0 * tb * (1.0 - tb) / 0.12);
    let k = select(1.0, node_pattern_band(width * abs(ds) * length(dr)), width > 0.0);
    let h = pcg_hash(bitcast<u32>(i32(ring)) ^ (seed * 0x9e3779b1u));
    return NodePatternRings(mix(0.59, a * b, k), k * dv * ds * dr, mix(0.5, f32(h >> 8u) / 16777215.0, k));
}

// A urdidura passa por cima no cruzamento (i, j)? Ligamento de `over` por cima e `under` por baixo, deslocado `shift`
// fios a cada fio de urdidura: (j + shift · i) mod (over + under) < over.
fn node_pattern_weave_top(i: f32, j: f32, over: f32, m: f32, shift: f32) -> f32 {
    let s = j + shift * i;
    return select(0.0, 1.0, s - m * floor(s / m) + 0.5 < over);
}

// Descida do fio de cima para o lado em que ele mergulha: smoothstep(0; 0,5; t) e a derivada — (valor, d/dt).
fn node_pattern_weave_dive(t: f32) -> vec2f {
    let u = clamp(2.0 * t, 0.0, 1.0);
    return vec2f(u * u * (3.0 - 2.0 * u), 12.0 * u * (1.0 - u));
}

/**
 * Trama (spec 011): tecido de `scale` fios por unidade de `p` nos dois sentidos — a urdidura corre ao longo de `p.y`, a
 * trama ao longo de `p.x`. Ligamento: a urdidura passa `over` fios por cima e `under` por baixo, deslocada `shift` a cada
 * fio (tela 1/1/1; sarja do jeans 3/1/1, a diagonal; cetim 4/1/2). Cada fio tem a largura (1 − `gap`) do passo e a seção
 * parabólica; o de cima mergulha 0,55 da altura para o lado em que passa por baixo, o de baixo fica a 0,45. Saídas:
 * `height` em [0, 1] e o gradiente ∂/∂p; `warp` 1 onde o fio à vista é de urdidura, 0 de trama (as duas cores do jeans,
 * a direção do fio para o brilho anisotrópico); `thread` o valor em [0, 1] do fio à vista (a irregularidade de fio para
 * fio); `gap` 1 no vão entre os fios (o tecido aberto). Abaixo do pixel: altura a 0,5, `warp` à fração do ligamento
 * (over / (over + under)), `thread` a 0,5, `gap` à área dos vãos (`gap`²), gradiente a zero.
 */
fn node_pattern_weave(p: vec2f, width: f32, wrap: vec2f, scale: f32, over: u32, under: u32, shift: u32, gap: f32,
    seed: u32) -> NodePatternWeave {
    let ov = f32(max(over, 1u));
    let m = ov + f32(max(under, 1u));
    let sh = f32(shift);
    let fx = node_pattern_fit(scale, wrap.x, m);
    let fy = node_pattern_fit(scale, wrap.y, m);
    let fr = vec2f(fx.x, fy.x);
    let q = p * fr;
    let i = floor(q);
    let f = q - i - vec2f(0.5);
    let g = clamp(gap, 0.0, 0.9);
    let hw = 0.5 * (1.0 - g);
    // Seção dos fios: a urdidura varia em x, a trama em y — (valor, derivada).
    let inside = abs(f) < vec2f(hw);
    let section = select(vec2f(0.0), vec2f(1.0) - f * f / (hw * hw), inside);
    let slope = select(vec2f(0.0), -2.0 * f / (hw * hw), inside);
    let top = node_pattern_weave_top(i.x, i.y, ov, m, sh);
    var h_top: f32;
    var g_top: vec2f;
    var h_low: f32;
    var g_low: vec2f;
    if (top > 0.5) {
        // Urdidura por cima: mergulha em y para o lado em que o cruzamento vizinho é de trama.
        let next = node_pattern_weave_dive(f.y) * (1.0 - node_pattern_weave_top(i.x, i.y + 1.0, ov, m, sh));
        let prev = node_pattern_weave_dive(-f.y) * (1.0 - node_pattern_weave_top(i.x, i.y - 1.0, ov, m, sh));
        let along = 1.0 - 0.55 * (next.x + prev.x);
        h_top = section.x * along;
        g_top = vec2f(slope.x * along, section.x * -0.55 * (next.y - prev.y));
        h_low = 0.45 * section.y;
        g_low = vec2f(0.0, 0.45 * slope.y);
    } else {
        // Trama por cima: mergulha em x para o lado em que o cruzamento vizinho é de urdidura.
        let next = node_pattern_weave_dive(f.x) * node_pattern_weave_top(i.x + 1.0, i.y, ov, m, sh);
        let prev = node_pattern_weave_dive(-f.x) * node_pattern_weave_top(i.x - 1.0, i.y, ov, m, sh);
        let along = 1.0 - 0.55 * (next.x + prev.x);
        h_top = section.y * along;
        g_top = vec2f(section.y * -0.55 * (next.y - prev.y), slope.y * along);
        h_low = 0.45 * section.x;
        g_low = vec2f(0.45 * slope.x, 0.0);
    }
    let upper = h_top >= h_low;
    // O fio à vista é de urdidura: o de cima num cruzamento de urdidura, ou o de baixo num de trama.
    let warp = select(1.0 - top, top, upper);
    let thread = node_pattern_hash(select(vec2f(-1.0, i.y), vec2f(i.x, -1.0), warp > 0.5),
        select(vec2f(0.0, fy.y), vec2f(fx.y, 0.0), warp > 0.5), seed);
    let k = select(1.0, node_pattern_band(width * max(abs(fr.x), abs(fr.y))), width > 0.0);
    return NodePatternWeave(
        mix(0.5, select(h_low, h_top, upper), k),
        k * select(g_low, g_top, upper) * fr,
        mix(ov / m, warp, k),
        mix(0.5, f32(thread >> 8u) / 16777215.0, k),
        mix(g * g, select(0.0, 1.0, !inside.x && !inside.y), k),
    );
}
