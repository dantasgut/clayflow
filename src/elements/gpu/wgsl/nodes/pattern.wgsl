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
// Requer: noise (o hash PCG); constants (TAU).

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
    knot: f32,
    along: vec2f,
    bend: vec2f,
}

struct NodePatternBricks {
    height: f32,
    gradient: vec2f,
    brick: f32,
    mortar: f32,
}

struct NodePatternPlanks {
    p: vec2f,
    height: f32,
    gradient: vec2f,
    plank: f32,
    joint: f32,
}

struct NodePatternFissures {
    height: f32,
    gradient: vec2f,
    plate: f32,
}

struct NodePatternDents {
    height: f32,
    gradient: vec2f,
    cell: f32,
}

struct NodePatternShingles {
    height: f32,
    gradient: vec2f,
    tile: f32,
    gap: f32,
    along: f32,
}

struct NodePatternVeins {
    height: f32,
    gradient: vec2f,
    main: f32,
    across: f32,
    cell: f32,
}

struct NodePatternBrush {
    value: f32,
    gradient: vec2f,
    direction: vec2f,
    deep: f32,
}

struct NodePatternAreoles {
    height: f32,
    gradient: vec2f,
    cell: f32,
    wall: f32,
}

struct NodePatternGlints {
    cells: vec3f,
    count: f32,
}

struct NodePatternWeave {
    height: f32,
    gradient: vec2f,
    warp: f32,
    thread: f32,
    gap: f32,
    fiber: vec2f,
    strand: f32,
}

struct NodePatternKnit {
    height: f32,
    gradient: vec2f,
    fiber: vec2f,
    stitch: f32,
    gap: f32,
    strand: f32,
}

struct NodePatternThreshold {
    value: f32,
    gradient: vec2f,
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
 * `bend`: quando `p` é uma coordenada curva (x, f(x, y)) — a do veio, `along` de `pattern.rings` —, `bend` = ∇f na
 * coordenada de fora: o gradiente sai nela pela regra da cadeia e a largura do pixel acompanha o aperto de f. (0, 1):
 * `p` é a própria coordenada de fora.
 */
fn node_pattern_grain(p: vec2f, width: f32, wrap: vec2f, bend: vec2f, scale: vec2f, seed: u32, octaves: u32,
    lacunarity: f32, gain: f32) -> NodePatternGrain {
    let tight = max(1.0, abs(bend.y));
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
        let band = select(1.0, node_pattern_band(width * max(abs(fr.x), abs(fr.y) * tight)), width > 0.0);
        sum += amp * band * vec3f(v.x, v.yz * fr);
        norm += amp;
        amp *= gain;
        freq *= lacunarity;
    }
    let g = sum.yz / norm;
    return NodePatternGrain(sum.x / norm, vec2f(g.x + g.y * bend.x, g.y * bend.y));
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
 * de ano para ano). Os nós (olhos) da madeira: `knots` células por unidade de `p`, um nó em três delas em cada dez, cada
 * um um galho que atravessa a tábua — soma ao raio um monte gaussiano de meia largura `knot_size` (em `p`, alongado 1,6
 * vez ao longo da fibra) e altura de `knot_rings` anéis: os anéis do tronco desviam em volta dele e, dentro, fecham em
 * voltas concêntricas; `knot` é o miolo do nó em [0, 1] (a madeira escura e dura do galho). `knots` 0: sem nós.
 * Abaixo do pixel: o perfil à média, `ring` a 0,5, gradiente a zero. `scale`, `depth` e `knots` vêm primeiro: são
 * entradas com valor do nó (ligáveis). `fall`: a fração do anel em que o perfil cai do lenho tardio ao inicial do ano
 * seguinte (0,12: a queda abrupta; maior, a crista mais larga e suave — a subida encolhe na mesma proporção: 0,7 · (1 −
 * `fall`) / 0,88). `along` = (p.x, r): a coordenada do veio — x ao longo da fibra, o raio através dela, com a
 * ondulação e o desvio dos nós —, e `bend` = ∂r/∂p: o que corre ao longo da fibra (`pattern.grain` com `p` = `along`
 * e `bend`) acompanha as curvas dos anéis.
 */
fn node_pattern_rings(p: vec2f, width: f32, wrap: vec2f, scale: f32, depth: f32, knots: f32, distortion: f32,
    distortion_scale: vec2f, seed: u32, irregularity: f32, waviness: f32, waviness_scale: vec2f, knot_size: f32,
    knot_rings: f32, fall: f32) -> NodePatternRings {
    let fx = node_pattern_fit(distortion_scale.x, wrap.x, 1.0);
    let fr = vec2f(fx.x, distortion_scale.y);
    let nz = node_pattern_noise(p * fr, vec2f(fx.y, 0.0), seed);
    let z = depth + distortion * nz.x;
    let wx = node_pattern_fit(waviness_scale.x, wrap.x, 1.0);
    let wr = vec2f(wx.x, waviness_scale.y);
    let nw = node_pattern_noise(p * wr, vec2f(wx.y, 0.0), seed + 1u);
    let r0 = max(sqrt(p.y * p.y + z * z), 1e-6);
    // Os nós: um monte gaussiano por nó somado ao raio (3 × 3 células em volta), e o miolo de cada um.
    var bump = vec3f(0.0);
    var knot = 0.0;
    if (knots > 0.0) {
        let kx = node_pattern_fit(knots, wrap.x, 1.0);
        let kf = vec2f(kx.x, knots);
        let kq = p * kf;
        let ki = floor(kq);
        let sigma = max(knot_size, 1e-4);
        let lift = knot_rings / max(scale, 1e-6);
        for (var dy = -1; dy <= 1; dy++) {
            for (var dx = -1; dx <= 1; dx++) {
                let c = ki + vec2f(f32(dx), f32(dy));
                let h = node_pattern_hash(c, vec2f(kx.y, 0.0), seed + 3u);
                if (f32(h >> 8u) / 16777215.0 >= 0.3) { continue; }
                let h2 = pcg_hash(h);
                let at = (c + vec2f(0.5) + 0.3 * vec2f(hash_signed(h2), hash_signed(pcg_hash(h2)))) / kf;
                let e = (p - at) / (sigma * vec2f(1.6, 1.0));
                let g = exp(-dot(e, e));
                bump += lift * g * vec3f(1.0, -2.0 * e / (sigma * vec2f(1.6, 1.0)));
                knot = max(knot, exp(-4.0 * dot(e, e)));
            }
        }
    }
    let r = max(r0 + waviness * nw.x + bump.x, 1e-6);
    let dr = (vec2f(0.0, p.y) + z * distortion * nz.yz * fr) / r0 + waviness * nw.yz * wr + bump.yz;
    let s0 = r * scale;
    let irr = clamp(irregularity, 0.0, 1.0);
    let ni = node_pattern_noise(vec2f(s0 * 0.1875, 0.5), vec2f(0.0), seed + 2u);
    let s = s0 + irr * ni.x;
    let ds = scale * (1.0 + irr * 0.1875 * ni.y);
    let ring = floor(s);
    let t = s - ring;
    let fl = clamp(fall, 0.02, 0.6);
    let rise = 0.7 * (1.0 - fl) / 0.88;
    let ta = clamp(t / rise, 0.0, 1.0);
    let tb = clamp((t - (1.0 - fl)) / fl, 0.0, 1.0);
    let a = ta * ta * (3.0 - 2.0 * ta);
    let b = 1.0 - tb * tb * (3.0 - 2.0 * tb);
    let dv = (6.0 * ta * (1.0 - ta) / rise) * b - a * (6.0 * tb * (1.0 - tb) / fl);
    let k = select(1.0, node_pattern_band(width * abs(ds) * length(dr)), width > 0.0);
    let h = pcg_hash(bitcast<u32>(i32(ring)) ^ (seed * 0x9e3779b1u));
    return NodePatternRings(mix(1.0 - 0.5 * (rise + fl), a * b, k), k * dv * ds * dr,
        mix(0.5, f32(h >> 8u) / 16777215.0, k), knot, vec2f(p.x, r), dr);
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
 * fio); `gap` 1 no vão entre os fios (o tecido aberto); `fiber` a direção em `p` da fibra do fio à vista — o fio é um
 * cilindro de fibras torcidas em hélice de ângulo `twist` (radianos) com o eixo: no meio do fio a fibra faz esse ângulo
 * com o eixo, nas bordas corre junto dele (a tangente do brilho anisotrópico: o realce em tracinhos de fio em fio);
 * `strand` os cabos do fio torcido em [0, 1] — três faixas em hélice em torno do fio, uma volta por passo (1 nas
 * cristas dos cabos, 0 nos sulcos entre eles; 1 sem torção).
 * Abaixo do pixel: altura a 0,5, `warp` à fração do ligamento (over / (over + under)), `thread` a 0,5, `gap` à área dos
 * vãos (`gap`²), a fibra à média dos dois eixos pelo ligamento, `strand` a 0,5, gradiente a zero.
 */
fn node_pattern_weave(p: vec2f, width: f32, wrap: vec2f, scale: f32, over: u32, under: u32, shift: u32, gap: f32,
    seed: u32, twist: f32) -> NodePatternWeave {
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
    // A fibra do fio à vista: a hélice de ângulo `twist` em torno do eixo do fio, vista de cima — no meio do fio faz o
    // ângulo inteiro com o eixo, nas bordas (onde a seção vira de lado) corre junto dele.
    let turn = sin(twist) * sqrt(max(select(section.y, section.x, warp > 0.5), 0.0));
    let fiber = select(vec2f(cos(twist), -turn), vec2f(turn, cos(twist)), warp > 0.5);
    let mean_warp = ov / m;
    // Os cabos do fio torcido: três faixas em hélice em torno do fio (uma volta por passo), vistas de cima.
    let across = clamp(select(f.y, f.x, warp > 0.5) / hw, -1.0, 1.0);
    let along = select(q.x, q.y, warp > 0.5);
    let strand = select(1.0, 0.5 + 0.5 * cos(3.0 * asin(across) + sign(twist) * TAU * along), twist != 0.0);
    return NodePatternWeave(
        mix(0.5, select(h_low, h_top, upper), k),
        k * select(g_low, g_top, upper) * fr,
        mix(mean_warp, warp, k),
        mix(0.5, f32(thread >> 8u) / 16777215.0, k),
        mix(g * g, select(0.0, 1.0, !inside.x && !inside.y), k),
        mix(vec2f(1.0 - mean_warp, mean_warp), fiber, k),
        mix(select(1.0, 0.5, twist != 0.0), strand, k),
    );
}

/**
 * Tricô (spec 011): malha em ponto meia vista do direito — colunas de pontos em V, `scale` colunas por unidade de `p.x`
 * e `scale` · `aspect` carreiras por unidade de `p.y`. Cada ponto são duas pernas de fio (elipsoides alongados de meia
 * largura 0,2 · `thickness` da coluna) que sobem do meio da coluna para as bordas e passam por baixo da carreira de
 * cima (cada perna tem uma carreira e meia de comprimento: as de carreiras vizinhas se sobrepõem, vale a mais alta).
 * Saídas: `height` em [0, 1] e o gradiente ∂/∂p; `fiber` a direção da fibra à vista em `p` (o eixo da perna girado
 * pela hélice de ângulo `twist`, como em `pattern.weave`); `stitch` o valor em [0, 1] do ponto; `gap` 1 onde não há fio
 * (o fundo entre as pernas); `strand` os cabos do fio torcido em [0, 1] (três faixas em hélice, duas voltas por perna;
 * 1 sem torção). Abaixo do pixel: altura a 0,35, `stitch` a 0,5, `gap` a 0,15, a fibra ao longo de `p.y`, `strand` a
 * 0,5, gradiente a zero.
 */
fn node_pattern_knit(p: vec2f, width: f32, wrap: vec2f, scale: f32, aspect: f32, thickness: f32, seed: u32,
    twist: f32) -> NodePatternKnit {
    let fx = node_pattern_fit(scale, wrap.x, 1.0);
    let fy = node_pattern_fit(scale * max(aspect, 1e-3), wrap.y, 1.0);
    let fr = vec2f(fx.x, fy.x);
    let q = p * fr;
    let i = floor(q);
    let f = q - i;
    let side = select(-1.0, 1.0, f.x >= 0.5);
    let a = abs(f.x - 0.5);
    let w = 0.2 * clamp(thickness, 0.1, 1.0);
    var h = 0.0;
    var g = vec2f(0.0);
    var row = 0.0;
    var sec_best = 0.0;
    var turn_best = 0.0;
    for (var r = -1; r <= 1; r++) {
        // A perna da carreira i.y + r: t em [0, 1] ao longo dela (um quarto de carreira para baixo e para cima).
        let t = (f.y - f32(r) + 0.25) / 1.5;
        let d = a - (0.03 + 0.27 * t);
        if (t <= 0.0 || t >= 1.0 || abs(d) >= w) { continue; }
        let sec = 1.0 - d * d / (w * w);
        let e = 2.0 * t - 1.0;
        let env = 1.0 - e * e;
        if (sec * env > h) {
            h = sec * env;
            g = vec2f(side * (-2.0 * d / (w * w)) * env, ((2.0 * d / (w * w)) * 0.27 * env - sec * 4.0 * e) / 1.5);
            row = f32(r);
            sec_best = sec;
            turn_best = 3.0 * asin(clamp(d / w, -1.0, 1.0)) + sign(twist) * side * 2.0 * TAU * t;
        }
    }
    let k = select(1.0, node_pattern_band(width * max(abs(fr.x), abs(fr.y))), width > 0.0);
    let stitch = node_pattern_hash(vec2f(i.x, i.y + row), vec2f(fx.y, fy.y), seed);
    // O eixo da perna em `p` (sobe 1,5 carreira enquanto anda 0,27 coluna para a borda) e a hélice da fibra em torno dele.
    let axis = normalize(vec2f(side * 0.27 / fr.x, 1.5 / fr.y));
    let turn = sin(twist) * sqrt(max(sec_best, 0.0));
    let fiber = axis * cos(twist) + vec2f(axis.y, -axis.x) * turn;
    let strand = select(1.0, 0.5 + 0.5 * cos(turn_best), twist != 0.0 && h > 0.0);
    return NodePatternKnit(
        mix(0.35, h, k),
        k * g * fr,
        mix(vec2f(0.0, 1.0), fiber, k),
        mix(0.5, f32(stitch >> 8u) / 16777215.0, k),
        mix(0.15, select(0.0, 1.0, h <= 0.0), k),
        mix(select(1.0, 0.5, twist != 0.0), strand, k),
    );
}

/**
 * Limiar suave com gradiente (spec 011): smoothstep(`low`; `high`; `value`) e o gradiente dele pela regra da cadeia
 * sobre `gradient` (∂`value`/∂p) — recorta de um padrão uma faixa em relevo (a fresta onde o grão passa de um nível, o
 * lenho tardio saliente, a crosta da ferrugem) sem perder a derivada. `low` > `high` inverte.
 */
fn node_pattern_threshold(value: f32, gradient: vec2f, low: f32, high: f32) -> NodePatternThreshold {
    let span = high - low;
    let d = select(span, select(-1e-6, 1e-6, span >= 0.0), abs(span) < 1e-6);
    let t = clamp((value - low) / d, 0.0, 1.0);
    return NodePatternThreshold(t * t * (3.0 - 2.0 * t), (6.0 * t * (1.0 - t) / d) * gradient);
}

/**
 * Tijolos (spec 011): fiadas de peças retangulares com junta — `scale` (peças por unidade de `p.x`, fiadas por unidade
 * de `p.y`), cada fiada deslocada `shift` peça em relação à de baixo (0,5: a amarração do tijolo; 0: a grade do
 * azulejo). A junta tem a largura `gap` (fração da altura da fiada, a mesma nos dois sentidos) e a aresta da peça sobe
 * arredondada em `bevel` (fração da altura da fiada). Saídas: `height` em [0, 1] (0 na junta, 1 na face) e o gradiente
 * ∂/∂p; `brick` o valor em [0, 1] da peça (o tom de tijolo para tijolo); `mortar` 1 na junta. Abaixo do pixel: a altura
 * e a junta à média da área, `brick` a 0,5, gradiente a zero.
 */
fn node_pattern_bricks(p: vec2f, width: f32, wrap: vec2f, scale: vec2f, shift: f32, gap: f32, bevel: f32, seed: u32)
    -> NodePatternBricks {
    let fx = node_pattern_fit(scale.x, wrap.x, 1.0);
    let fy = node_pattern_fit(scale.y, wrap.y, select(1.0, 2.0, shift != 0.0));
    let fr = vec2f(fx.x, fy.x);
    let qy = p.y * fr.y;
    let row = floor(qy);
    let qx = p.x * fr.x + shift * row;
    let col = floor(qx);
    let f = vec2f(qx - col, qy - row) - vec2f(0.5);
    let g = clamp(gap, 0.0, 0.9);
    // A distância à borda da peça, em alturas de fiada (a junta tem a mesma largura nos dois sentidos).
    let aspect = fr.y / fr.x;
    let ex = (0.5 - abs(f.x)) * aspect - 0.5 * g;
    let ey = (0.5 - abs(f.y)) - 0.5 * g;
    let along = ex < ey;
    let d = min(ex, ey);
    let bw = max(bevel, 1e-4);
    let t = clamp(d / bw, 0.0, 1.0);
    let toward = select(vec2f(0.0, -sign(f.y)), vec2f(-sign(f.x), 0.0), along) * fr.y;
    let k = select(1.0, node_pattern_band(width * max(abs(fr.x), abs(fr.y))), width > 0.0);
    let h = node_pattern_hash(vec2f(col, row), vec2f(fx.y, fy.y), seed);
    let face = max(1.0 - g, 0.0) * max(1.0 - g / max(aspect, 1e-6), 0.0);
    return NodePatternBricks(
        mix(face, t * t * (3.0 - 2.0 * t), k),
        k * (6.0 * t * (1.0 - t) / bw) * toward,
        mix(0.5, f32(h >> 8u) / 16777215.0, k),
        mix(1.0 - face, select(0.0, 1.0, d <= 0.0), k),
    );
}

/**
 * Mossas (spec 011): o metal martelado — uma calota côncava por célula de um Voronoi 2D de `scale` células por unidade
 * de `p` (o ponto de cada uma deslocado por `jitter`): a altura é o quadrado da distância ao ponto mais próximo (o
 * fundo da mossa no ponto, a aresta viva onde duas mossas se encontram), 2 · d² presa em 1. Saídas: `height` em [0, 1]
 * e o gradiente ∂/∂p; `cell` o valor em [0, 1] da mossa. Abaixo do pixel: altura a 0,3, `cell` a 0,5, gradiente a zero.
 */
fn node_pattern_dents(p: vec2f, width: f32, wrap: vec2f, scale: f32, jitter: f32, seed: u32) -> NodePatternDents {
    let fx = node_pattern_fit(scale, wrap.x, 1.0);
    let fy = node_pattern_fit(scale, wrap.y, 1.0);
    let fr = vec2f(fx.x, fy.x);
    let per = vec2f(fx.y, fy.y);
    let q = p * fr;
    let i = floor(q);
    let f = q - i;
    var best = 1e30;
    var r1 = vec2f(0.0);
    var h1 = 0u;
    for (var dy = -1; dy <= 1; dy++) {
        for (var dx = -1; dx <= 1; dx++) {
            let c = node_pattern_cell_point(i, vec2f(f32(dx), f32(dy)), f, per, seed, jitter);
            let d = dot(c.r, c.r);
            if (d < best) {
                best = d;
                r1 = c.r;
                h1 = c.h;
            }
        }
    }
    let k = select(1.0, node_pattern_band(width * max(abs(fr.x), abs(fr.y))), width > 0.0);
    let inside = 2.0 * best < 1.0;
    return NodePatternDents(
        mix(0.3, min(2.0 * best, 1.0), k),
        k * select(vec2f(0.0), -4.0 * r1 * fr, inside),
        mix(0.5, f32(h1 >> 8u) / 16777215.0, k),
    );
}

/**
 * Tábuas (spec 011): o assoalho — peças de madeira de 1 largura por `length` larguras, `scale` larguras por unidade de
 * `p`. `arrangement` 0: réguas em fileiras ao longo de `p.x`, cada fileira deslocada ao acaso; 1: espinha de peixe (as peças
 * alternam a 90°, cada uma encostada no topo da vizinha). Saídas: `p` a coordenada dentro da peça, em unidades de `p`,
 * com o comprimento ao longo de x e um deslocamento próprio de cada peça (até 16 unidades ao longo, ± 1 através) — a entrada dos padrões do
 * veio (`pattern.rings`, `pattern.grain`): cada tábua tem os seus anéis, na sua direção —; `height` em [0, 1] (0 na
 * junta, 1 na face, a aresta arredondada em `bevel` larguras) e o gradiente ∂/∂p; `plank` o valor em [0, 1] da peça (o
 * tom de tábua para tábua); `joint` 1 na junta (de largura `gap` larguras). Abaixo do pixel: a altura a 1, a junta a
 * zero, `plank` a 0,5, gradiente a zero (a coordenada da peça não tem média: os padrões do veio filtram a deles).
 */
fn node_pattern_planks(p: vec2f, width: f32, wrap: vec2f, scale: f32, length: f32, arrangement: u32, gap: f32, bevel: f32,
    seed: u32) -> NodePatternPlanks {
    let n = max(round(length), 1.0);
    let herring = arrangement == 1u;
    let step = select(vec2f(n, 1.0), vec2f(2.0 * n), herring);
    let fx = node_pattern_fit(scale, wrap.x, step.x);
    let fy = node_pattern_fit(scale, wrap.y, step.y);
    let fr = vec2f(fx.x, fy.x);
    let q = p * fr;
    // A peça: o índice dela (para o hash), a posição ao longo (em [0, n]) e através (em [0, 1]) e a direção em `p`.
    var id = vec2f(0.0);
    var local = vec2f(0.0);
    var turned = false;
    var per = vec2f(0.0);
    if (herring) {
        let c = floor(q);
        let m = (c.x - c.y) - 2.0 * n * floor((c.x - c.y) / (2.0 * n));
        turned = m >= n;
        if (turned) {
            let first = c.y - (2.0 * n - 1.0 - m);
            id = vec2f(c.x, first);
            local = vec2f(q.y - first, q.x - c.x);
        } else {
            id = vec2f(c.x - m, c.y);
            local = vec2f(q.x - id.x, q.y - c.y);
        }
        per = vec2f(fx.y, fy.y);
    } else {
        let row = floor(q.y);
        let shift = floor(n * f32(node_pattern_hash(vec2f(-7.0, row), vec2f(0.0, fy.y), seed) >> 8u) / 16777216.0);
        let along = (q.x + shift) / n;
        id = vec2f(floor(along), row);
        local = vec2f((along - id.x) * n, q.y - row);
        per = vec2f(fx.y / n, fy.y);
    }
    let h = node_pattern_hash(id, per, seed + select(0u, 17u, turned));
    let h2 = pcg_hash(h);
    // A distância à borda da peça, em larguras.
    let ex = min(local.x, n - local.x) - 0.5 * gap;
    let ey = min(local.y, 1.0 - local.y) - 0.5 * gap;
    let bw = max(bevel, 1e-4);
    let d = min(ex, ey);
    let t = clamp(d / bw, 0.0, 1.0);
    let toward_local = select(vec2f(0.0, select(-1.0, 1.0, local.y < 0.5)), vec2f(select(-1.0, 1.0, local.x < 0.5 * n), 0.0),
        ex < ey);
    let toward = select(toward_local, toward_local.yx, turned) * fr;
    let k = select(1.0, node_pattern_band(width * max(abs(fr.x), abs(fr.y))), width > 0.0);
    let offset = vec2f(16.0 * f32(h2 >> 8u), 2.0 * f32(pcg_hash(h2) >> 8u)) / 16777216.0 - vec2f(0.0, 1.0);
    return NodePatternPlanks(
        local / fr.x + offset,
        mix(1.0, t * t * (3.0 - 2.0 * t), k),
        k * (6.0 * t * (1.0 - t) / bw) * toward,
        mix(0.5, f32(h >> 8u) / 16777215.0, k),
        k * select(0.0, 1.0, d <= 0.0),
    );
}

/**
 * Fissuras (spec 011): a casca de árvore, o barro em tiras — placas alongadas separadas por uma rede de fissuras que
 * se ramificam e se juntam. Um Voronoi 2D com frequência por eixo `scale` (placas por unidade de `p.x` e de `p.y`:
 * (9, 1,8) dá placas cinco vezes mais compridas ao longo de `p.y`), o ponto de cada célula deslocado por `jitter`.
 * `height` = smoothstep(0, `crease`, distância à borda da placa) — 0 no fundo da fissura, 1 na face —, com a distância
 * medida em `p` e posta em células do eixo de maior frequência: a fissura tem a mesma largura em `p` em qualquer
 * direção. Saídas: `height` em [0, 1] e o gradiente ∂/∂p; `plate` o valor em [0, 1] da placa. Abaixo do pixel: a altura
 * à média (1 − `crease`), `plate` a 0,5, gradiente a zero.
 */
fn node_pattern_fissures(p: vec2f, width: f32, wrap: vec2f, scale: vec2f, jitter: f32, crease: f32, seed: u32)
    -> NodePatternFissures {
    let fx = node_pattern_fit(scale.x, wrap.x, 1.0);
    let fy = node_pattern_fit(scale.y, wrap.y, 1.0);
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
    let top = max(abs(fr.x), abs(fr.y));
    var edge = 1e30;
    var slope = vec2f(0.0);
    for (var dy = -2; dy <= 2; dy++) {
        for (var dx = -2; dx <= 2; dx++) {
            if (dx == 0 && dy == 0) { continue; }
            let c = node_pattern_cell_point(i, o1 + vec2f(f32(dx), f32(dy)), f, per, seed, jitter);
            let dr = c.r - r1;
            let l2 = dot(dr, dr);
            if (l2 > 1e-12) {
                let dn = dr * inverseSqrt(l2);
                // A distância à mediatriz em células, levada a `p` (÷ |dn ∘ fr|) e às células do eixo mais fino.
                let stretch = top / max(length(dn * fr), 1e-6);
                let d = dot(0.5 * (r1 + c.r), dn) * stretch;
                if (d < edge) {
                    edge = d;
                    slope = -dn * fr * stretch;
                }
            }
        }
    }
    let cw = max(crease, 1e-4);
    let t = clamp(edge / cw, 0.0, 1.0);
    let k = select(1.0, node_pattern_band(width * top), width > 0.0);
    return NodePatternFissures(
        mix(1.0 - min(cw, 1.0), t * t * (3.0 - 2.0 * t), k),
        k * (6.0 * t * (1.0 - t) / cw) * slope,
        mix(0.5, f32(h1 >> 8u) / 16777215.0, k),
    );
}

// O perfil transversal de uma telha de capa e canal em `u` (0 a 1 através da telha): (altura em [0, 1], ∂/∂u) — a capa
// convexa no meio (62 % da largura, de 0,3 a 1) e o canal côncavo entre duas capas (de 0,3 a 0).
fn node_pattern_shingle_cross(u: f32) -> vec2f {
    let a = abs(2.0 * u - 1.0);
    let side = select(-2.0, 2.0, u >= 0.5);
    let c = 0.62;
    if (a < c) {
        let x = 1.57079633 * a / c;
        return vec2f(0.3 + 0.7 * cos(x), -0.7 * sin(x) * 1.57079633 / c * side);
    }
    let x = 1.57079633 * (a - c) / (1.0 - c);
    return vec2f(0.3 * (1.0 - sin(x)), -0.3 * cos(x) * 1.57079633 / (1.0 - c) * side);
}

/**
 * Fiadas sobrepostas (spec 011, T118): o telhado — telhas, placas de ardósia, escamas — em fiadas ao longo de `p.x`,
 * cada telha deitada sobre a fiada de baixo. `scale`: telhas por unidade de `p.x` e fiadas por unidade de `p.y` (negativo:
 * o pé das telhas para o lado de `p.y` maior); cada
 * fiada deslocada `shift` telha em relação à de baixo (0,5: as juntas desencontradas da ardósia; 0: as colunas da
 * telha de capa e canal). A telha é um plano inclinado: grossa no pé (a borda de baixo, `p.y` menor, à vista) e
 * enfiada sob a fiada de cima — em espessuras, a altura cai de 1 no pé a 0 no topo da parte à vista, e no degrau do pé
 * desce para a telha de baixo, que ali está em 0: o dente de serra que faz a sombra de cada fiada. No vão lateral entre
 * duas telhas (`gap`, em alturas de fiada) e sob o pé recuado (`irregularity`: cada telha recua o pé até essa fração da
 * fiada, ao acaso) aparece a telha de baixo, uma espessura abaixo. A borda sobe arredondada em `bevel` (alturas de
 * fiada). `profile` (0 a 1) é a fração da altura que vem do perfil transversal da telha de capa e canal (a capa
 * convexa, o canal côncavo entre duas capas); 0: a placa plana. Saídas: `height` em [0, 1] e o gradiente ∂/∂p; `tile`
 * o valor em [0, 1] da telha à vista; `gap` 1 onde a que se vê é a de baixo; `along` a posição na fiada (0 no pé, 1 no
 * topo). Abaixo do pixel: a altura a 0,5, `tile` a 0,5, `gap` e o gradiente a zero.
 */
fn node_pattern_shingles(p: vec2f, width: f32, wrap: vec2f, scale: vec2f, shift: f32, gap: f32, bevel: f32,
    profile: f32, irregularity: f32, seed: u32) -> NodePatternShingles {
    let fx = node_pattern_fit(scale.x, wrap.x, 1.0);
    let fy = node_pattern_fit(abs(scale.y), wrap.y, select(1.0, 2.0, shift != 0.0));
    let fr = vec2f(fx.x, fy.x);
    let per = vec2f(fx.y, fy.y);
    // `scale.y` negativo: o pé das telhas para o lado de `p.y` maior.
    let up = select(1.0, -1.0, scale.y < 0.0);
    let qy = p.y * fr.y * up;
    let row = floor(qy);
    let v = qy - row;
    // A telha desta fiada e a da fiada de baixo no ponto.
    let qx = p.x * fr.x + shift * row;
    let col = floor(qx);
    let u = qx - col;
    let h = node_pattern_hash(vec2f(col, row), per, seed);
    let qx0 = p.x * fr.x + shift * (row - 1.0);
    let col0 = floor(qx0);
    let u0 = qx0 - col0;
    let h0 = node_pattern_hash(vec2f(col0, row - 1.0), per, seed);
    // A distância à borda da telha desta fiada, em alturas de fiada: aos lados (o vão) e ao pé (recuado).
    let aspect = fr.y / fr.x;
    let foot = clamp(irregularity, 0.0, 0.9) * f32(pcg_hash(h) >> 8u) / 16777216.0;
    let ex = (0.5 - abs(u - 0.5)) * aspect - 0.5 * max(gap, 0.0);
    let ey = v - foot;
    let d = min(ex, ey);
    let bw = max(bevel, 1e-4);
    let t = clamp(d / bw, 0.0, 1.0);
    let own = t * t * (3.0 - 2.0 * t);
    let toward = select(vec2f(0.0, fr.y), vec2f(select(1.0, -1.0, u >= 0.5) * fr.y, 0.0), ex < ey);
    let d_own = (6.0 * t * (1.0 - t) / bw) * toward;
    let pf = clamp(profile, 0.0, 1.0);
    let c = node_pattern_shingle_cross(u);
    let c0 = node_pattern_shingle_cross(u0);
    let flat = 0.5 * (own - v + 1.0);
    let d_flat = 0.5 * (d_own - vec2f(0.0, fr.y));
    let curved = mix(c0.x, c.x, own);
    let d_curved = vec2f(mix(c0.y, c.y, own) * fr.x, 0.0) + (c.x - c0.x) * d_own;
    let k = select(1.0, node_pattern_band(width * max(abs(fr.x), abs(fr.y))), width > 0.0);
    let seen = select(h0, h, d > 0.0);
    return NodePatternShingles(
        mix(0.5, mix(flat, curved, pf), k),
        k * mix(d_flat, d_curved, pf) * vec2f(1.0, up),
        mix(0.5, f32(seen >> 8u) / 16777215.0, k),
        k * select(0.0, 1.0, d <= 0.0),
        v,
    );
}

// Os dois pontos de célula mais próximos de `q` (3 × 3 células em volta; `jitter` até 0,8 para valer): a posição de
// cada um relativa a `q` e o hash do primeiro.
struct NodePatternCellPair {
    r1: vec2f,
    r2: vec2f,
    h: u32,
}

fn node_pattern_cell_pair(q: vec2f, per: vec2f, seed: u32, jitter: f32) -> NodePatternCellPair {
    let i = floor(q);
    let f = q - i;
    var d1 = 1e30;
    var d2 = 1e30;
    var out = NodePatternCellPair(vec2f(0.0), vec2f(0.0), 0u);
    for (var dy = -1; dy <= 1; dy++) {
        for (var dx = -1; dx <= 1; dx++) {
            let c = node_pattern_cell_point(i, vec2f(f32(dx), f32(dy)), f, per, seed, jitter);
            let d = dot(c.r, c.r);
            if (d < d1) {
                d2 = d1;
                out.r2 = out.r1;
                d1 = d;
                out.r1 = c.r;
                out.h = c.h;
            } else if (d < d2) {
                d2 = d;
                out.r2 = c.r;
            }
        }
    }
    return out;
}

// A posição na célula arredondada: t = 2 · d₁ / (d₁ + d₂) (d₁, d₂ as distâncias aos dois pontos mais próximos) — 0 no
// ponto da célula, 1 na borda; as curvas de t constante são círculos (de Apolônio), não polígonos. Devolve (t, ∂t/∂q).
fn node_pattern_round(c: NodePatternCellPair) -> vec3f {
    let d1 = max(length(c.r1), 1e-6);
    let d2 = max(length(c.r2), 1e-6);
    let s = d1 + d2;
    return vec3f(2.0 * d1 / s, 2.0 * (d1 * c.r2 / d2 - d2 * c.r1 / d1) / (s * s));
}

/**
 * Aréolas (spec 011, T120): células arredondadas — as almofadas do limbo de uma folha entre as vênulas, as bolhas, os
 * seixos. `scale` células por unidade de `p`, o ponto de cada uma deslocado por `jitter` (até 0,8). A posição na
 * célula é t = 2 · d₁ / (d₁ + d₂), das distâncias aos dois pontos mais próximos: as curvas de nível são círculos, e a
 * rede das bordas tem os cantos arredondados. `height` = 1 − t² — a almofada abaulada, lisa, 1 no meio e 0 na borda —,
 * com o `gradient` ∂/∂p; `cell` o valor em [0, 1] da célula (indo a 0,5 na borda: a mancha é redonda); `wall` a borda em [0, 1]: smoothstep(1 − `wall`, 1, t) (a
 * vênula). Abaixo do pixel: altura e `cell` a 0,5, gradiente e `wall` a zero.
 */
fn node_pattern_areoles(p: vec2f, width: f32, wrap: vec2f, scale: f32, jitter: f32, wall: f32, seed: u32)
    -> NodePatternAreoles {
    let fx = node_pattern_fit(scale, wrap.x, 1.0);
    let fy = node_pattern_fit(scale, wrap.y, 1.0);
    let fr = vec2f(fx.x, fy.x);
    let c = node_pattern_cell_pair(p * fr, vec2f(fx.y, fy.y), seed, min(jitter, 0.8));
    let t = node_pattern_round(c);
    let k = select(1.0, node_pattern_band(width * max(abs(fr.x), abs(fr.y))), width > 0.0);
    let e = clamp((t.x - 1.0 + wall) / max(wall, 1e-4), 0.0, 1.0);
    return NodePatternAreoles(
        mix(0.5, 1.0 - t.x * t.x, k),
        k * (-2.0 * t.x) * t.yz * fr,
        mix(0.5, f32(c.h >> 8u) / 16777215.0, k * (1.0 - smoothstep(0.55, 0.9, t.x))),
        k * e * e * (3.0 - 2.0 * e),
    );
}

/**
 * Nervuras (spec 011, T118 e T120): a folha — a nervura central ao longo de `p.x`, as secundárias que saem dela dos
 * dois lados, alternadas, as terciárias em escada entre duas secundárias e a rede fina das vênulas. `scale`: lâminas
 * por unidade de `p.x` (o comprimento) e de `p.y` (a largura; a nervura central no meio de cada lâmina). `veins`
 * secundárias de cada lado por comprimento de lâmina (inteiro: fecha no período); saem com a inclinação `slope` (a
 * tangente do ângulo com a nervura central) e curvam para a ponta com `curve` (o avanço ao longo da lâmina, em
 * larguras, pelo quadrado da distância à nervura central). `irregular` (0 a 0,35): o espaçamento e o ângulo das
 * secundárias variam de uma para a outra e ao longo de cada uma (um ruído desloca a contagem delas, até essa fração
 * do espaço entre duas). `thickness` é a meia largura da nervura central na base, em larguras da lâmina; `taper` (0 a
 * 1) a fração que ela perde até a ponta; as secundárias têm a metade e afinam até a margem. `ladder`: terciárias por
 * largura de lâmina (0: sem) — degraus que ligam duas secundárias vizinhas, atravessados a elas, cada vão com a sua
 * fase, tortos. As
 * vênulas são as bordas arredondadas das aréolas (`node_pattern_round`) de `fine` células por unidade de `p` (0:
 * sem). Saídas: `height` em [0, 1] — 1 na crista da nervura central, 0,7 na das secundárias, 0,4 na das terciárias,
 * 0,35 na das vênulas, 0 no limbo —, com o gradiente ∂/∂p (com `irregular`, sem a variação da inclinação ao longo da
 * nervura); `main` as nervuras central, secundárias e terciárias (estas a 0,5) em [0, 1]; `across` a distância à
 * nervura central (0 nela, 1 na margem da lâmina); `cell` o valor em [0, 1] da aréola. Abaixo do pixel as nervuras
 * somem (a altura e o gradiente a zero, `cell` a 0,5), as vênulas antes das principais.
 */
fn node_pattern_veins(p: vec2f, width: f32, wrap: vec2f, scale: vec2f, veins: f32, slope: f32, curve: f32,
    thickness: f32, fine: f32, seed: u32, irregular: f32, taper: f32, ladder: f32) -> NodePatternVeins {
    let fx = node_pattern_fit(scale.x, wrap.x, 1.0);
    let fy = node_pattern_fit(scale.y, wrap.y, 1.0);
    let fr = vec2f(fx.x, fy.x);
    // A posição na lâmina em larguras dela: ao longo (0 a `len`) e através (−0,5 a 0,5, a nervura central em 0).
    let len = fr.y / fr.x;
    let qx = p.x * fr.x;
    let qy = p.y * fr.y;
    let xb = (qx - floor(qx)) * len;
    let yb = qy - floor(qy) - 0.5;
    let ay = abs(yb);
    let sy = select(-1.0, 1.0, yb >= 0.0);
    // A nervura central, mais fina para a ponta.
    let thin = 1.0 - clamp(taper, 0.0, 1.0) * xb / len;
    let w0 = max(thickness * thin, 1e-4);
    let t0 = clamp(ay / w0, 0.0, 1.0);
    let m0 = 1.0 - t0 * t0 * (3.0 - 2.0 * t0);
    let g0 = (-6.0 * t0 * (1.0 - t0) / w0) * vec2f(0.0, sy * fr.y);
    // As secundárias: as curvas s = constante, s = x − |y| / slope − curve · y², uma a cada `len` / `veins`.
    let n = max(round(veins), 1.0);
    let sp = len / n;
    let sl = max(slope, 1e-3);
    let ds = -1.0 / sl - 2.0 * curve * ay;
    var s = (xb - ay / sl - curve * ay * ay) / sp + select(0.0, 0.5, yb < 0.0);
    // ∇s em (x, |y|), em larguras da lâmina.
    var gs = vec2f(1.0, ds) / sp;
    let side = select(0u, 1u, yb < 0.0);
    if (irregular > 0.0) {
        let wn = node_pattern_noise(vec2f(s, 3.0 * ay), vec2f(n, 0.0), seed + 7u + side);
        s += irregular * wn.x;
        gs = gs * (1.0 + irregular * wn.y) + vec2f(0.0, 3.0 * irregular * wn.z);
    }
    let fs = s - floor(s) - 0.5;
    let gl = max(length(gs), 1e-6);
    let d1 = abs(fs) / gl;
    let fade = 0.5 * (1.0 - 1.4 * ay);
    let w1 = w0 * max(fade, 0.12);
    let dw1 = select(0.0, -0.7 * w0, fade > 0.12);
    let t1 = clamp(d1 / w1, 0.0, 1.0);
    let m1 = 1.0 - t1 * t1 * (3.0 - 2.0 * t1);
    // ∂t1/∂(x, |y|): a distância pela curva, pela inclinação dela (que muda com |y|) e pela largura (que afina).
    let sg = select(-1.0, 1.0, fs >= 0.0);
    let dt1 = (sg * gs / gl + vec2f(0.0, 2.0 * curve * d1 * ds / (1.0 + ds * ds) - d1 * dw1 / w1)) / w1;
    let g1 = (-6.0 * t1 * (1.0 - t1)) * vec2f(dt1.x, dt1.y * sy) * fr.y;
    // As terciárias: os degraus entre duas secundárias — as curvas de tt constante, tt = ladder · |y| + 0,8 · fs +
    // a fase do vão + um ruído.
    var m3 = 0.0;
    var g3 = vec2f(0.0);
    if (ladder > 0.0) {
        let span = floor(s);
        let phase = random_unit(pcg_hash(bitcast<u32>(i32(span - n * floor(span / n))) * 2u + side + seed * 0x9e3779b1u));
        let wn = node_pattern_noise(vec2f(2.0 * s, 0.25 * ladder * ay), vec2f(2.0 * n, 0.0), seed + 9u + side);
        // Os degraus atravessam as secundárias: tt cresce ao longo da direção em que elas saem (um número inteiro de
        // degraus no comprimento da lâmina: fecha no período).
        let run = vec2f(round(ladder * len / sqrt(1.0 + sl * sl)) / len, ladder * sl / sqrt(1.0 + sl * sl));
        let tt = run.x * xb + run.y * ay + phase + 0.18 * wn.x;
        let gt = run + 0.18 * (2.0 * wn.y * gs + vec2f(0.0, 0.25 * ladder * wn.z));
        let ft = tt - floor(tt) - 0.5;
        let glt = max(length(gt), 1e-6);
        let w3 = 0.3 * w0;
        let t3 = clamp(abs(ft) / glt / w3, 0.0, 1.0);
        m3 = 1.0 - t3 * t3 * (3.0 - 2.0 * t3);
        let dt3 = select(-1.0, 1.0, ft >= 0.0) * gt / glt / w3;
        g3 = (-6.0 * t3 * (1.0 - t3)) * vec2f(dt3.x, dt3.y * sy) * fr.y;
    }
    // As vênulas: as bordas arredondadas das aréolas.
    var m2 = 0.0;
    var g2 = vec2f(0.0);
    var cell = 0.5;
    var k2 = 0.0;
    if (fine > 0.0) {
        let vx = node_pattern_fit(fine, wrap.x, 1.0);
        let vy = node_pattern_fit(fine, wrap.y, 1.0);
        let vr = vec2f(vx.x, vy.x);
        let c = node_pattern_cell_pair(p * vr, vec2f(vx.y, vy.y), seed, 0.8);
        let t = node_pattern_round(c);
        let t2 = clamp((t.x - 0.75) / 0.25, 0.0, 1.0);
        k2 = select(1.0, node_pattern_band(width * max(abs(vr.x), abs(vr.y))), width > 0.0);
        m2 = k2 * t2 * t2 * (3.0 - 2.0 * t2);
        g2 = k2 * (6.0 * t2 * (1.0 - t2) / 0.25) * t.yz * vr;
        // O valor da aréola some na borda dela (a mancha de cada uma é redonda, como a almofada).
        cell = mix(0.5, f32(c.h >> 8u) / 16777215.0, k2 * (1.0 - smoothstep(0.55, 0.9, t.x)));
    }
    // O detalhe das principais pela largura do pixel em espaços entre secundárias.
    let k1 = select(1.0, node_pattern_band(width * fr.y / min(sp, 1.0)), width > 0.0);
    let k3 = select(1.0, node_pattern_band(width * fr.y * max(ladder, 1.0 / min(sp, 1.0))), width > 0.0);
    let main = max(max(m0, m1), 0.5 * k3 * m3);
    var height = k1 * m0;
    var gradient = k1 * g0;
    if (0.7 * k1 * m1 > height) {
        height = 0.7 * k1 * m1;
        gradient = 0.7 * k1 * g1;
    }
    if (0.4 * k3 * m3 > height) {
        height = 0.4 * k3 * m3;
        gradient = 0.4 * k3 * g3;
    }
    if (0.35 * m2 > height) {
        height = 0.35 * m2;
        gradient = 0.35 * g2;
    }
    return NodePatternVeins(height, gradient, k1 * main, 2.0 * ay, cell);
}

/**
 * Brilhos pontuais (spec 011, T118): as células do sorteio dos flocos menores que o pixel — a entrada de
 * `closure.glints`. `scale` flocos por unidade de `p` (por lado: `scale`² por unidade de área). A célula do pixel é a de
 * uma grade de lado 2ⁿ flocos, n = ⌊log₂(largura do pixel em flocos) + ½⌋ ≥ 0 — de 0,7 a 1,4 pixel de lado — e a do
 * nível seguinte, de lado dobrado; a mistura entre os dois níveis é a fração de n (a troca de nível com a distância é
 * contínua: o segundo nível de uma distância é o primeiro da seguinte). Saídas: `cells` (o valor em [0, 1] da célula
 * em cada nível e a mistura) e `count`, o número de flocos na célula do primeiro nível (4ⁿ; a do segundo tem o
 * quádruplo). A célula é fixa em `p` (o objeto): os brilhos não andam com a câmera. Com os flocos maiores que 2 pixels
 * (resolvidos pelo padrão, com a normal de cada um) não há sorteio — `count` 0 —, e na transição `count` cresce (a
 * contagem vai à média). Sem a largura do pixel (0): `count` 0. `wrap` não entra: as células são um sorteio, sem
 * emenda que se veja.
 */
fn node_pattern_glints(p: vec2f, width: f32, wrap: vec2f, scale: f32, seed: u32) -> NodePatternGlints {
    let w = width * abs(scale);
    let k = smoothstep(0.2, 0.5, w);
    if (k <= 0.0) { return NodePatternGlints(vec3f(0.0), 0.0); }
    let lod = max(log2(w) + 0.5, 0.0);
    let level = floor(lod);
    let side = exp2(level);
    let q = p * scale;
    let ha = node_pattern_hash(floor(q / side), vec2f(0.0), seed + 2u * u32(level));
    let hb = node_pattern_hash(floor(q / (2.0 * side)), vec2f(0.0), seed + 2u * u32(level) + 2u);
    return NodePatternGlints(
        vec3f(f32(ha >> 8u) / 16777215.0, f32(hb >> 8u) / 16777215.0, lod - level),
        side * side / k,
    );
}

// Um risco fundo isolado da escova: a grade de células `q` (alongadas ao longo de x), uma célula em `chance` com um
// sulco de ângulo e fundura próprios, que morre nas pontas da célula. Devolve (fundura em [0, 1], ∂/∂q.x, ∂/∂q.y).
fn node_pattern_brush_gouge(q: vec2f, per: vec2f, seed: u32, chance: f32) -> vec3f {
    let i = floor(q);
    let f = q - i;
    let h = node_pattern_hash(i, per, seed);
    if (random_unit(h) >= chance) { return vec3f(0.0); }
    let h2 = pcg_hash(h);
    let h3 = pcg_hash(h2);
    let slope = 0.5 * random_unit(h2) - 0.25;
    let yc = 0.3 + 0.4 * random_unit(h3) + slope * (f.x - 0.5);
    let depth = 0.4 + 0.6 * random_unit(pcg_hash(h3));
    let t = clamp(abs(f.y - yc) / 0.09, 0.0, 1.0);
    let across = 1.0 - t * t * (3.0 - 2.0 * t);
    let e = clamp(min(f.x, 1.0 - f.x) / 0.25, 0.0, 1.0);
    let along = e * e * (3.0 - 2.0 * e);
    let dt = select(-1.0, 1.0, f.y >= yc) / 0.09;
    let dacross = -6.0 * t * (1.0 - t) * dt;
    let dalong = 6.0 * e * (1.0 - e) * select(-4.0, 4.0, f.x < 0.5) * select(0.0, 1.0, e < 1.0);
    return depth * vec3f(across * along, across * dalong - dacross * slope * along, dacross * along);
}

/**
 * Escova (spec 011, T120): os riscos de um metal escovado à mão ou de um acabamento acetinado — quatro passadas de
 * riscos finos ao longo de `p.x`, cada uma com a sua frequência (`scale`: riscos por unidade de `p` ao longo e através,
 * crescendo de passada em passada) e a sua direção, que varia de lugar para lugar: a coordenada através da escova de
 * cada passada é deslocada por um ruído largo próprio (`bend_scale` ondas por unidade de `p`), de modo que a inclinação
 * dos riscos oscila até `spread` (radianos) — os riscos são levemente curvos e os de passadas diferentes se cruzam em
 * ângulos pequenos. Cada risco é um trecho do ruído alongado: comprimento e fundura variam. Por cima, os riscos fundos
 * isolados: uma célula em `deep` de duas grades alongadas tem um sulco com ângulo e fundura próprios (até ± 14° na
 * grade), que morre nas pontas. Saídas: `value` (a altura: os riscos finos em [-1, 1] menos os fundos, até −1,8), o
 * `gradient` ∂/∂p, `direction` — a direção dos riscos em `p` no ponto (unitária; a tangente do lobo anisotrópico) — e
 * `deep`, o risco fundo em [0, 1]. Abaixo do pixel os riscos vão à média (a anisotropia do lobo os representa).
 */
fn node_pattern_brush(p: vec2f, width: f32, wrap: vec2f, scale: vec2f, spread: f32, bend_scale: vec2f, deep: f32,
    seed: u32) -> NodePatternBrush {
    let bx = node_pattern_fit(bend_scale.x, wrap.x, 1.0);
    let by = node_pattern_fit(bend_scale.y, wrap.y, 1.0);
    let br = vec2f(bx.x, by.x);
    // A amplitude do deslocamento que dá a inclinação `spread` (a derivada do ruído chega a ~1,4 por célula).
    let reach = spread / (1.4 * max(br.x, 1e-6));
    var sum = vec3f(0.0);
    var dir = vec2f(0.0);
    var norm = 0.0;
    var amp = 1.0;
    for (var k = 0u; k < 4u; k++) {
        let fx = node_pattern_fit(scale.x * (1.0 + 0.5 * f32(k)), wrap.x, 1.0);
        let fy = node_pattern_fit(scale.y * (1.0 + 0.37 * f32(k)), wrap.y, 1.0);
        let w = node_pattern_noise(p * br, vec2f(bx.y, by.y), seed + 16u + k);
        let slant = reach * w.yz * br;
        let v = node_pattern_noise(vec2f(p.x * fx.x, (p.y + reach * w.x) * fy.x), vec2f(fx.y, fy.y), seed + k);
        let band = select(1.0, node_pattern_band(width * max(abs(fx.x), abs(fy.x))), width > 0.0);
        sum += amp * band * vec3f(v.x, v.y * fx.x + v.z * fy.x * slant.x, v.z * fy.x * (1.0 + slant.y));
        dir += amp * normalize(vec2f(1.0 + slant.y, -slant.x));
        norm += amp;
        amp *= 0.8;
    }
    var out = sum / norm;
    var gouge = 0.0;
    if (deep > 0.0) {
        for (var k = 0u; k < 2u; k++) {
            let gx = node_pattern_fit(scale.x * (3.0 + 2.0 * f32(k)), wrap.x, 1.0);
            let gy = node_pattern_fit(scale.y * (0.17 + 0.08 * f32(k)), wrap.y, 1.0);
            let gr = vec2f(gx.x, gy.x);
            let g = node_pattern_brush_gouge(p * gr + vec2f(0.5 * f32(k), 0.0), vec2f(gx.y, gy.y), seed + 32u + k, deep);
            let band = select(1.0, node_pattern_band(width * 5.0 * abs(gr.y)), width > 0.0);
            out -= 0.8 * band * vec3f(g.x, g.yz * gr);
            gouge = max(gouge, band * g.x);
        }
    }
    return NodePatternBrush(out.x, out.yz, normalize(dir), gouge);
}
