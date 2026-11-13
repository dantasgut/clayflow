// Consulta ao campo dos fluidos (spec 033, R11): φ num ponto (trilinear para os passos da marcha; B-spline tricúbica com
// o gradiente para o cruzamento e a normal — contínua até a segunda derivada: a superfície é lisa de perto, em qualquer
// resolução de tela) e a marcha de um raio: pelos blocos ao longo do raio (os vazios pulados até a saída deles), dentro
// dos ocupados por passos de distância (φ é distância com sinal na faixa), o cruzamento refinado por secante; a saída
// (a espessura atravessada) pela mesma marcha por dentro. Sem bloco, vazio. A mesma superfície para a câmera, a luz, os
// raios da estrutura e a luz rebatida.
// Requer: NONE, fluid_field, field_common, field_lookup, field_atlas_read.

/** Acerto da marcha: distância, ponto, normal (para fora), corpo (índice + 1 na tabela `bodies`) e se acertou. */
struct FieldHit {
    t: f32,
    p: vec3f,
    n: vec3f,
    body: u32,
    hit: bool,
}

/** φ trilinear no ponto `p` dentro do bloco de índice `brick` e coordenadas `b` (a filtragem do atlas, T060f). */
fn field_phi_linear(brick: u32, b: vec3i, p: vec3f) -> f32 {
    return field_atlas_linear(brick, p / field_voxel() - 0.5 - vec3f(b * FIELD_BRICK));
}

/** Pesos da B-spline cúbica uniforme (x) e as derivadas (y) para a fração `t`. */
fn field_bspline(t: f32) -> mat4x2f {
    let t2 = t * t;
    let t3 = t2 * t;
    let s = 1.0 - t;
    return mat4x2f(
        vec2f(s * s * s / 6.0, -s * s / 2.0),
        vec2f((3.0 * t3 - 6.0 * t2 + 4.0) / 6.0, (3.0 * t2 - 4.0 * t) / 2.0),
        vec2f((-3.0 * t3 + 3.0 * t2 + 3.0 * t + 1.0) / 6.0, (-3.0 * t2 + 2.0 * t + 1.0) / 2.0),
        vec2f(t3 / 6.0, t2 / 2.0),
    );
}

/** φ (w) e ∇φ (xyz) pela B-spline tricúbica no ponto `p` dentro do bloco `brick` de coordenadas `b`. */
fn field_cubic(brick: u32, b: vec3i, p: vec3f) -> vec4f {
    let g = p / field_voxel() - 0.5 - vec3f(b * FIELD_BRICK);
    let base = clamp(vec3i(floor(g)), vec3i(-1), vec3i(FIELD_BRICK - 1));
    let f = clamp(g - vec3f(base), vec3f(0.0), vec3f(1.0));
    let bx = field_bspline(f.x);
    let by = field_bspline(f.y);
    let bz = field_bspline(f.z);
    var out = vec4f(0.0);
    for (var k = 0; k < 4; k++) {
        for (var j = 0; j < 4; j++) {
            for (var i = 0; i < 4; i++) {
                let v = field_atlas_at(brick, base + vec3i(i - 1, j - 1, k - 1));
                let wx = bx[i];
                let wy = by[j];
                let wz = bz[k];
                out += v * vec4f(wx.y * wy.x * wz.x, wx.x * wy.y * wz.x, wx.x * wy.x * wz.y, wx.x * wy.x * wz.x);
            }
        }
    }
    return vec4f(out.xyz / field_voxel(), out.w);
}

/** φ tricúbico em `p` (vazio fora dos blocos: a faixa). */
fn field_phi_at(p: vec3f) -> f32 {
    let b = field_brick_of(p);
    let brick = field_find(b);
    if (brick == NONE) { return 3.0 * fluid_field.grid.w; }
    return field_cubic(brick, b, p).w;
}

/** Caixa do campo em mundo (os limites em voxels do suporte das partículas); vazia com lo ≥ hi. */
fn field_box() -> array<vec3f, 2> {
    let v = field_voxel();
    let lo = vec3f(f32(field_bound(0u)), f32(field_bound(1u)), f32(field_bound(2u))) * v;
    let hi = vec3f(f32(field_bound(3u)), f32(field_bound(4u)), f32(field_bound(5u))) * v;
    return array<vec3f, 2>(lo, hi);
}

/** Trecho [t0, t1] do raio dentro da caixa do campo (vazio: x ≥ y). */
fn field_clip(o: vec3f, d: vec3f, t0: f32, t1: f32) -> vec2f {
    let box = field_box();
    if (any(box[0] >= box[1])) { return vec2f(1.0, 0.0); }
    let safe = select(d, vec3f(1e-12), abs(d) < vec3f(1e-12));
    let a = (box[0] - o) / safe;
    let b = (box[1] - o) / safe;
    let near = min(a, b);
    let far = max(a, b);
    return vec2f(max(max(max(near.x, near.y), near.z), t0), min(min(min(far.x, far.y), far.z), t1));
}

/** Corpo (índice + 1 na tabela `bodies`) do bloco que contém `p`; 0 fora dos blocos. */
fn field_body_at(p: vec3f) -> u32 {
    let brick = field_find(field_brick_of(p));
    if (brick == NONE) { return 0u; }
    return u32(field_brick_at(brick).w);
}

/**
 * O registro do corpo `body` (índice + 1, a palavra dos blocos; 0 = nenhum) na tabela do campo: (índice + 1 da função
 * `material` na composição dos acertos dos raios, 0 sem; slot dos parâmetros dela; 0; 0).
 */
/** Palavras do meio de um corpo no buffer das consultas (`FIELD_MEDIUM_WORDS` no TypeScript; spec 039). */
const FIELD_MEDIUM_WORDS: u32 = 8u;

fn field_body(body: u32) -> vec4u {
    if (body == 0u) { return vec4u(0u); }
    return fluid_field.bodies[body - 1u];
}

/** Distância ao longo de `dir` até a saída do bloco `b` a partir de `p`. */
fn field_brick_exit(b: vec3i, p: vec3f, dir: vec3f) -> f32 {
    return field_cell_exit(vec3f(b) * field_brick_size(), field_brick_size(), p, dir);
}

/** Distância ao longo de `dir` até a saída do cubo [lo, lo + size] a partir de `p`. */
fn field_cell_exit(lo: vec3f, size: f32, p: vec3f, dir: vec3f) -> f32 {
    let hi = lo + vec3f(size);
    // A componente nula vira +1e-12, e o lado da célula sai do sinal dela (não do da original): pelo da original, a
    // distância daquele eixo saía negativa e cortada em 0 — o raio alinhado a um eixo andava 1e-4 por passo.
    let safe = select(dir, vec3f(1e-12), abs(dir) < vec3f(1e-12));
    let t = select((lo - p) / safe, (hi - p) / safe, safe > vec3f(0.0));
    return max(min(min(t.x, t.y), t.z), 0.0);
}

/** φ trilinear em `p` com o bloco em cache (`cache.xyz` as coordenadas, `cache.w` o índice; trocado quando sai dele). */
fn field_phi_cached(p: vec3f, cache: ptr<function, vec4i>) -> f32 {
    let b = field_brick_of(p);
    if (any(b != (*cache).xyz)) { *cache = vec4i(b, bitcast<i32>(field_find(b))); }
    let brick = bitcast<u32>((*cache).w);
    if (brick == NONE) { return 3.0 * fluid_field.grid.w; }
    return field_phi_linear(brick, b, p);
}

/** A saída de dentro pela borda de um bloco vazio, em `t`, com o corpo `body` do último bloco com campo. */
fn field_edge_exit(origin: vec3f, dir: vec3f, t: f32, sgn: f32, body: u32) -> FieldHit {
    return FieldHit(t, origin + dir * t, -dir * sgn, body, true);
}

/**
 * Passos de marcha por invocação, somados em todas as marchas dela (spec 034, T065f): o teto do trabalho de um pixel,
 * qualquer que seja o aninhamento de quem consulta (o caminho da refração, a olhada à frente, os raios de sombra). O
 * caso comum usa poucas centenas; o teto de 2048 deixa o pior caso de uma tela 1280×720 em dezenas de ms, nunca um
 * kernel preso (que trava a tela: a GPU é a mesma). Esgotado, a marcha não acha mais nada.
 */
const FIELD_STEP_BUDGET: u32 = 2048u;
var<private> field_steps_left: u32 = FIELD_STEP_BUDGET;

/**
 * Marcha de `origin` na direção unitária `dir` de `t0` a `t1` até a superfície (de fora para dentro, `inside` falso) ou
 * até sair do fluido (de dentro para fora, `inside` verdadeiro). Pelos blocos: os vazios pulados até a saída deles (a
 * busca na tabela só quando o raio muda de bloco), nos ocupados passos de distância em φ trilinear. O cruzamento:
 * secante na trilinear e, com `refine`, um passo de Newton na tricúbica, que dá também a normal (contínua); sem `refine`
 * (só a distância, como a espessura), a secante basta. Com `departing`, a origem está numa superfície com o lado
 * conhecido (`inside`): o cruzamento só conta depois de o raio estar desse lado.
 */
fn field_march(origin: vec3f, dir: vec3f, t0: f32, t1: f32, inside: bool, refine: bool, departing: bool) -> FieldHit {
    let miss = FieldHit(t1, origin + dir * t1, vec3f(0.0, 1.0, 0.0), 0u, false);
    let voxel = field_voxel();
    let sgn = select(1.0, -1.0, inside);
    let min_step = 0.25 * voxel;
    var cache = vec4i(2147483647, 0, 0, bitcast<i32>(NONE));
    var super_cache = vec4i(2147483647, 0, 0, 0);
    let super_size = 4.0 * field_brick_size();
    var t = t0;
    var t_prev = t0;
    var f_prev = 1e9;
    // Partindo de uma superfície com o lado conhecido (`departing`: logo depois de cruzá-la ou de refletir nela), a
    // trilinear dos passos pode estar do outro lado da tricúbica que deu o ponto: o cruzamento só conta depois de o raio
    // estar do lado de partida — sem isso ele reacertava a superfície de onde saiu.
    var armed = !departing;
    // O último passo pararia além de `t1` sem amostrar o fim: a superfície nos últimos milímetros antes dele (o raio que
    // cruza a água logo antes de sair do vidro, quando `t1` é a malha seguinte) se perdia. O fim é sempre amostrado.
    var last = false;
    // Vindo de dentro, a saída por um bloco vazio é a superfície do último bloco com campo: o corpo dele e o ponto na
    // borda, do lado dele (o passo que entrou no vazio passou 1e-4 dela; de lá, quem reflete partia sem campo e sem
    // corpo).
    var body_seen = 0u;
    for (var steps = 0u; steps < 512u; steps++) {
        if (field_steps_left == 0u) { return miss; }
        field_steps_left -= 1u;
        if (t >= t1) {
            if (last || t_prev >= t1) { break; }
            t = t1;
            last = true;
        }
        let p = origin + dir * t;
        let b = field_brick_of(p);
        // Superbloco vazio: 4 blocos de uma vez (a busca na tabela pequena só quando o raio muda de superbloco).
        let sb = field_super_of(b);
        if (any(sb != super_cache.xyz)) { super_cache = vec4i(sb, select(0, 1, field_super_present(sb))); }
        if (super_cache.w == 0) {
            if (inside) { return field_edge_exit(origin, dir, max(t - 2e-4, t0), sgn, body_seen); }
            t += field_cell_exit(vec3f(sb) * super_size, super_size, p, dir) + 1e-4;
            f_prev = 1e9;
            continue;
        }
        if (any(b != cache.xyz)) { cache = vec4i(b, bitcast<i32>(field_find(b))); }
        let brick = bitcast<u32>(cache.w);
        let exit = field_brick_exit(b, p, dir) + 1e-4;
        if (brick == NONE) {
            // Bloco vazio: fora do fluido (vindo de dentro, a saída é aqui).
            if (inside) { return field_edge_exit(origin, dir, max(t - 2e-4, t0), sgn, body_seen); }
            t += exit;
            f_prev = 1e9;
            continue;
        }
        body_seen = u32(field_brick_at(brick).w);
        let f = sgn * field_phi_linear(brick, b, p);
        if (!armed) {
            if (f <= 0.0) {
                t_prev = t;
                t += min(min_step, exit);
                continue;
            }
            armed = true;
        }
        if (f <= 0.0) {
            // Cruzou: secante na trilinear entre o último passo do lado de partida e este.
            var a = t_prev;
            var fa = f_prev;
            if (f_prev > 1e8) { fa = sgn * field_phi_cached(origin + dir * t_prev, &cache); }
            var c = t;
            var fc = f;
            if (fa <= 0.0) { a = t; fa = fc; }
            for (var k = 0u; k < 4u; k++) {
                if (fa - fc == 0.0) { break; }
                let m = a + (c - a) * (fa / (fa - fc));
                let fm = sgn * field_phi_cached(origin + dir * m, &cache);
                if (fm > 0.0) { a = m; fa = fm; } else { c = m; fc = fm; }
            }
            var tc = select(a + (c - a) * (fa / (fa - fc)), c, fa - fc == 0.0);
            // Vindo de um bloco vazio (pulado inteiro), o começo da secante fica nele, sem campo, e o cruzamento pode cair
            // ali: o ponto fica então na amostra deste bloco — quem parte da superfície parte de onde há campo (senão a
            // consulta seguinte, de "dentro", saía na hora pelo bloco vazio).
            if (field_find(field_brick_of(origin + dir * tc)) == NONE) { tc = t; }
            var body = field_brick_at(brick).w;
            if (!refine) { return FieldHit(tc, origin + dir * tc, -dir * sgn, u32(body), true); }
            // Newton na tricúbica (a superfície lisa): o ponto e a normal dela.
            var n = -dir * sgn;
            var pc = origin + dir * tc;
            let bc = field_brick_of(pc);
            let bi = field_find(bc);
            if (bi != NONE) {
                let g = field_cubic(bi, bc, pc);
                let slope = dot(g.xyz, dir);
                // O passo de Newton fica no trecho com campo (ele podia voltar até `a`, no bloco vazio de antes).
                if (abs(slope) > 1e-6) {
                    let tn = clamp(tc - g.w / slope, a, c);
                    if (field_find(field_brick_of(origin + dir * tn)) != NONE) { tc = tn; }
                }
                pc = origin + dir * tc;
                n = select(g.xyz / length(g.xyz), n, length(g.xyz) < 1e-8);
                body = field_brick_at(bi).w;
            }
            return FieldHit(tc, pc, n, u32(body), true);
        }
        t_prev = t;
        f_prev = f;
        t += min(max(f * 0.9, min_step), exit);
    }
    return miss;
}

/** A página de chave `key` da película no buffer das consultas (`NONE` sem ela; `field_film.wgsl`). */
fn field_film_data_page(key: u32) -> u32 {
    let base = fluid_field.film.x + field_film_pages_word();
    let mask = field_film_page_mask();
    var page = field_film_page_bucket(key);
    let step = (key << 1u) | 1u;
    for (var k = 0u; k < FIELD_FILM_PROBES; k++) {
        let found = field_data[base + page];
        if (found == key) { return page; }
        if (found == 0u) { return NONE; }
        page = (page + step) & mask;
    }
    return NONE;
}

/**
 * A película de uma célula (`field_film_cell_in`): a água livre (m; −1 na submersa — ali é a própria água do volume, não
 * película) e a saturação dos poros (a absorvida sobre a capacidade, em [0, 1]); da superfície dela, o coeficiente da
 * gota (`dropBaseCoefficient`: 0 onde a água não se junta em gotas), o cosseno do ângulo de contato e a espessura em que a
 * película se rompe (`filmBreakThickness`). Zero sem película.
 */
struct FieldFilmCell {
    wet: vec2f,
    kappa: f32,
    cos_t: f32,
    critical: f32,
    /** A força da borda por comprimento sobre a densidade, f / ρ (m³/s²: `contactLineRetention`). */
    hold: f32,
    /** A água correu pela célula nos últimos passos (o filete; `field_film_step_main`). */
    flowing: bool,
}

/** A película na célula `c` da página `page` (achada por `field_film_data_page`; `NONE`: sem película; spec 034). */
fn field_film_cell_in(page: u32, c: vec3i, axes: vec2i) -> FieldFilmCell {
    var out = FieldFilmCell(vec2f(0.0), 0.0, 1.0, 0.0, 0.0, false);
    let key = field_film_key(c);
    if (page == NONE || key == 0u) { return out; }
    let w = field_film_word(field_film_slot_in(page, c, axes));
    if (field_data[w] != key) { return out; }
    if (field_data[w + 3u] != 0u) {
        out.wet.x = -1.0;
        return out;
    }
    let surface = field_film_surface(max(field_data[w + 5u], 1u) - 1u, 0u);
    let drop = field_film_surface(max(field_data[w + 5u], 1u) - 1u, 1u);
    let absorbed = f32(field_data[w + 4u]) * FIELD_FILM_UNIT;
    out.wet = vec2f(f32(field_data[w + 1u]) * FIELD_FILM_UNIT,
        select(0.0, min(absorbed / surface.w, 1.0), surface.w > 0.0));
    out.kappa = drop.z;
    out.cos_t = drop.y;
    out.critical = drop.w;
    out.hold = surface.x;
    out.flowing = field_data[w + 7u] != 0u;
    return out;
}

/**
 * As gotas em que a película fina se rompe (spec 034, T066d) numa árvore de quadrados (`field_film_drops`): o bloco de
 * 2 × 2 células (nível 2, 12,5 mm com a célula de 6,25 mm), a célula (nível 1) e o quarto dela (nível 0, 3,1 mm). Cada
 * quadrado é uma gota só — a água inteira dele, as gotas dos filhos coalescidas — ou se divide nos quatro filhos: a
 * água de cada célula vai a exatamente uma gota (a massa se conserva célula a célula). Três níveis.
 */
const FIELD_FILM_DROP_LEVELS: i32 = 3;
/**
 * O limiar da coalescência: as gotas vizinhas de um nível se tocam e se juntam no quadrado de cima quando o diâmetro da
 * base delas passa de τ vezes o passo, com τ sorteado por quadrado em [0,5; 1,5) — a distância entre as gotas que
 * nascem na ruptura não é a da grade (a nucleação nos defeitos do sólido, que o modelo não resolve).
 */
const FIELD_FILM_DROP_TOUCH: vec2f = vec2f(0.5, 1.0);
/**
 * O alongamento da gota que a gravidade puxa ao longo do sólido: a razão dos eixos β = 1 + `x` χ e o deslocamento do
 * ápice para baixo de `y` χ do semieixo, com χ a carga da borda (o peso ao longo do sólido sobre a força de Furmidge
 * da largura dela; 1 na gota crítica). A borda de baixo avança (θ_a), a de cima recua (θ_r): a gota parada pende com a
 * frente mais íngreme e a cauda para cima — as gotas da foto de um vidro vertical, com razão de ~1,3 a 1,5 perto do
 * deslize.
 */
const FIELD_FILM_DROP_STRETCH: vec2f = vec2f(0.5, 0.25);

/**
 * A forma da gota de volume `volume` (m³) na calota do ângulo de contato (`sin_t`, `cos_t`) com a borda que segura
 * `hold` (f / ρ, m³/s²: `contactLineRetention` sobre a densidade) e a gravidade `gt` (m/s²) ao longo do sólido: o raio
 * a da base redonda de mesma área, os semieixos a⊥ (de lado) e a∥ (ao longo da descida), a⊥ a∥ = a², e o deslocamento
 * δ do ápice para baixo; w > 1 se a gota desliza (a carga χ ≥ 1: o peso passa da força de Furmidge da borda, f · 2a⊥).
 */
fn field_film_drop_shape(volume: f32, sin_t: f32, cos_t: f32, hold: f32, gt: f32) -> vec4f {
    let a = field_film_cap_base(volume, cos_t);
    if (gt <= 1e-3) { return vec4f(a, a, a, 0.0); }
    if (hold <= 0.0) { return vec4f(a, a, a, 2.0); }
    let load = gt * volume / (hold * 2.0 * a);
    let beta = 1.0 + FIELD_FILM_DROP_STRETCH.x * min(load, 1.0);
    let side = a / sqrt(beta);
    let chi = gt * volume / (hold * 2.0 * side);
    return vec4f(a, side, a * sqrt(beta), chi);
}

/**
 * A altura e a inclinação (no plano: ao longo da descida `down`, unitária, e de lado) no ponto a `r` (m) do centro da
 * base da gota de forma `shape` (`field_film_drop_shape`): a calota esférica de base a no espaço em que a base é
 * redonda — o lado escalado por a / a⊥, a descida por a / (a∥ ∓ δ) abaixo e acima do ápice (a metade de baixo mais
 * curta: a frente íngreme; a de cima mais longa: a cauda). Cada metade conserva a área da sua, e o volume é o da calota.
 */
fn field_film_drop_at(r: vec2f, shape: vec4f, down: vec2f, sin_t: f32, cos_t: f32, footprint: f32) -> vec3f {
    let a = shape.x;
    let side = shape.y;
    let along = shape.z;
    let delta = FIELD_FILM_DROP_STRETCH.y * min(shape.w, 1.0) * along;
    let lateral = vec2f(-down.y, down.x);
    let t = dot(r, down) - delta;
    let l = dot(r, lateral);
    let st = a / select(along + delta, along - delta, t > 0.0);
    let sl = a / side;
    let cap = field_film_cap_at(vec2f(l * sl, t * st), a, sin_t, cos_t, footprint, 2.0);
    // A inclinação de volta ao plano: a derivada pela escala de cada eixo.
    return vec3f(cap.x, (cap.z * st) * down + (cap.y * sl) * lateral);
}

/** O número em [0, 1) do quadrado `node` do nível `level` na camada `layer` (o eixo de fora), o sorteio `k`. */
fn field_film_drop_hash(layer: i32, level: i32, node: vec2i, k: u32) -> f32 {
    let seed = bitcast<vec3u>(vec3i(layer * 4 + level, node.x, node.y)) ^ vec3u(0x9E3779B9u * (k + 1u), 0x85EBCA6Bu, 0xC2B2AE35u);
    return f32(hash3(seed) & 0xFFFFu) / 65536.0;
}

/**
 * A gota do quadrado de lado `side_len` (m) e canto `corner` (m, no plano) com o volume `volume`: o centro sorteado no
 * quadrado até onde a base cabe nele; a altura e a inclinação dela no ponto `q`. `x` < 0 se a gota não cabe ou
 * desliza (o quadrado se divide).
 */
fn field_film_drop_in(q: vec2f, corner: vec2f, side_len: f32, volume: f32, layer: i32, level: i32, node: vec2i,
    down: vec2f, gt: f32, hold: f32, sin_t: f32, cos_t: f32, footprint: f32) -> vec3f {
    if (volume <= 0.0) { return vec3f(0.0); }
    let shape = field_film_drop_shape(volume, sin_t, cos_t, hold, gt);
    let delta = FIELD_FILM_DROP_STRETCH.y * min(shape.w, 1.0) * shape.z;
    // A meia extensão da base em u e v (o retângulo da elipse com a cauda).
    let lateral = vec2f(-down.y, down.x);
    let ext = abs(down) * (shape.z + delta) + abs(lateral) * shape.y;
    let room = 0.5 * side_len - ext;
    if (shape.w >= 1.0 || any(room < vec2f(0.0))) { return vec3f(-1.0, 0.0, 0.0); }
    let jitter = vec2f(field_film_drop_hash(layer, level, node, 1u), field_film_drop_hash(layer, level, node, 2u));
    let center = corner + 0.5 * side_len + (2.0 * jitter - 1.0) * room;
    return field_film_drop_at(q - center, shape, down, sin_t, cos_t, footprint);
}

/**
 * As gotas da película rompida no ponto `q` (m, no plano da camada `layer`): `cells` a água parada das células que se
 * rompem nas 4 × 4 a partir da célula `base`, de lado `size`. Do bloco de 2 × 2 células ao quarto de célula: o
 * quadrado é uma gota só quando as gotas dos quatro filhos se tocariam (`FIELD_FILM_DROP_TOUCH`) e a gota inteira cabe
 * nele e não desliza; senão se divide — a célula em quatro quartos com a água repartida por pesos sorteados (u³: muitas
 * gotas pequenas e poucas grandes). A altura e a inclinação da gota do quadrado do ponto.
 */
fn field_film_drops(q: vec2f, cells: ptr<function, array<f32, 16>>, base: vec2i, size: f32, layer: i32,
    down: vec2f, gt: f32, hold: f32, sin_t: f32, cos_t: f32, footprint: f32) -> vec3f {
    let own = vec2i(floor(q / size));
    let block = 2 * vec2i(floor(vec2f(own) * 0.5));
    let bi = clamp(block - base, vec2i(0), vec2i(2));
    let ci = clamp(own - base, vec2i(0), vec2i(3));
    // Nível 2: o bloco de 2 × 2 células.
    let v2 = ((*cells)[bi.x + 4 * bi.y] + (*cells)[bi.x + 1 + 4 * bi.y] + (*cells)[bi.x + 4 * (bi.y + 1)]
        + (*cells)[bi.x + 1 + 4 * (bi.y + 1)]) * size * size;
    if (v2 <= 0.0) { return vec3f(0.0); }
    let node2 = block / 2;
    let tau2 = FIELD_FILM_DROP_TOUCH.x + FIELD_FILM_DROP_TOUCH.y * field_film_drop_hash(layer, 2, node2, 0u);
    if (2.0 * field_film_cap_base(0.25 * v2, cos_t) >= tau2 * size) {
        let d = field_film_drop_in(q, vec2f(block) * size, 2.0 * size, v2, layer, 2, node2, down, gt, hold, sin_t, cos_t, footprint);
        if (d.x >= 0.0) { return d; }
    }
    // Nível 1: a célula.
    let v1 = (*cells)[ci.x + 4 * ci.y] * size * size;
    if (v1 <= 0.0) { return vec3f(0.0); }
    let half = 0.5 * size;
    let tau1 = FIELD_FILM_DROP_TOUCH.x + FIELD_FILM_DROP_TOUCH.y * field_film_drop_hash(layer, 1, own, 0u);
    if (2.0 * field_film_cap_base(0.25 * v1, cos_t) >= tau1 * half) {
        let d = field_film_drop_in(q, vec2f(own) * size, size, v1, layer, 1, own, down, gt, hold, sin_t, cos_t, footprint);
        if (d.x >= 0.0) { return d; }
    }
    // Nível 0: os quatro quartos da célula, a água pelos pesos sorteados.
    var weights = vec4f(0.0);
    for (var k = 0; k < 4; k++) {
        let w = field_film_drop_hash(layer, 0, 2 * own + vec2i(k % 2, k / 2), 0u);
        weights[k] = w * w * w + 1e-3;
    }
    let quarter = vec2i(floor((q - vec2f(own) * size) / half));
    let qi = clamp(quarter, vec2i(0), vec2i(1));
    let node0 = 2 * own + qi;
    let v0 = v1 * weights[qi.x + 2 * qi.y] / (weights.x + weights.y + weights.z + weights.w);
    let d = field_film_drop_in(q, vec2f(own) * size + vec2f(qi) * half, half, v0, layer, 0, node0, down, gt, hold, sin_t, cos_t, footprint);
    return max(d, vec3f(0.0));
}
/** A amplitude do serpentear do filete, em células (de ponta a ponta). */
const FIELD_FILM_RIVULET_WANDER: f32 = 0.6;
/** O raio da cabeça do filete (a gota que corre na frente dele) em meias larguras do filete. */
const FIELD_FILM_RIVULET_HEAD: f32 = 1.4;

/**
 * O ponto por onde o filete passa na célula `cell` (no plano, m): o centro dela deslocado de lado (`across`, unitária
 * na perpendicular da descida) por um sorteio da célula, até `FIELD_FILM_RIVULET_WANDER` / 2 células para cada lado.
 */
fn field_film_rivulet_center(cell: vec2i, size: f32, across: vec2f, layer: i32) -> vec2f {
    let wander = field_film_drop_hash(layer, 3, cell, 7u) - 0.5;
    return (vec2f(cell) + 0.5) * size + across * (FIELD_FILM_RIVULET_WANDER * wander * size);
}

/**
 * A base a (m) da calota esférica de volume `volume` (m³) e ângulo de contato de cosseno `cos_t`: V = π a³ (2 − 3 cos θ
 * + cos³ θ) / (3 sen³ θ).
 */
fn field_film_cap_base(volume: f32, cos_t: f32) -> f32 {
    let sin_t = sqrt(max(1.0 - cos_t * cos_t, 1e-6));
    let shape = max(2.0 - 3.0 * cos_t + cos_t * cos_t * cos_t, 1e-6);
    return pow(3.0 * volume * sin_t * sin_t * sin_t / (PI * shape), 1.0 / 3.0);
}

/**
 * A largura w (m) do filete de seção em arco de círculo com ângulo de contato θ (cosseno `cos_t`) que leva a água `h`
 * (m) de uma célula de lado `size` correndo ao longo dela: a seção A = (w/2)² (θ − sen θ cos θ) / sen² θ é a água da
 * célula por comprimento, h ℓ.
 */
fn field_film_rivulet_width(h: f32, size: f32, cos_t: f32) -> f32 {
    let sin_t = sqrt(max(1.0 - cos_t * cos_t, 1e-6));
    let theta = acos(clamp(cos_t, -1.0, 1.0));
    return 2.0 * sin_t * sqrt(h * size / max(theta - sin_t * cos_t, 1e-6));
}

/**
 * A película de espessura `h` (m) se rompe em gotas? Na molhagem parcial (κ > 0) a película mais fina que a espessura
 * crítica `critical` (e_c = 2 ℓ_c sen(θ/2), `filmBreakThickness`) é instável e se desfaz em gotas (de Gennes et al., cap.
 * 7); a mais grossa (a lâmina, o filete que corre, a poça) segue contínua.
 */
fn field_film_breaks(h: f32, kappa: f32, critical: f32) -> bool {
    return kappa > 0.0 && h > 0.0 && h < critical;
}

/**
 * A altura (x, m) e a inclinação (yz, m/m no plano) da calota de ângulo θ (`sin_t`, `cos_t`) e base de raio `a` (m) no
 * ponto a `r` (m, no plano) do centro dela: a esfera de raio R = a / sen θ acima do sólido. A calota menor que a amostra
 * (`footprint`: a largura que a amostra do pixel cobre na superfície, m) entra pela média dela na amostra, como a
 * filtragem de um mapa de alturas: esticada até o raio ρ da amostra, a altura vezes a fração coberta, (a/ρ)^`dims` (2 na
 * gota, 1 na faixa do filete, esticada só na largura).
 */
fn field_film_cap_at(r: vec2f, a: f32, sin_t: f32, cos_t: f32, footprint: f32, dims: f32) -> vec3f {
    let radius = a / max(sin_t, 1e-3);
    let sample = max(a, 0.5 * footprint);
    let k2 = a / sample;
    let cover = pow(k2, dims);
    let rs = r * k2;
    let rr = dot(rs, rs);
    if (rr >= a * a) { return vec3f(0.0); }
    let root = sqrt(max(radius * radius - rr, 1e-12));
    return vec3f((root - radius * cos_t) * cover, -rs / root * k2 * cover);
}

/** A película no ponto e a inclinação dela: a água livre e a saturação (`wet`) e o gradiente da água livre (m/m). */
struct FieldFilmSample {
    wet: vec2f,
    slope: vec3f,
}

/**
 * A película de água no ponto `p` da superfície de um sólido de normal `n` (spec 034, T066d): a das células da camada
 * junto ao sólido (`field_film_cell`) pela B-spline quadrática das 3 × 3 mais próximas no plano da superfície — os dois
 * eixos de fora da normal dominante, pelos centros das células. A leitura é contínua até a primeira derivada: a borda
 * da mancha e o rastro de uma gota saem como curvas suaves, sem os degraus da grade. A célula sem película conta como
 * zero. A inclinação é a derivada da mesma leitura, limitada pelo ângulo de contato: a superfície da água parada não
 * encontra o sólido mais inclinada que θ (Young) — a borda da poça, do filete e o menisco junto à água do volume têm a
 * largura que a célula não resolve, e a derivada da leitura nas células passava de tan θ (junto à água do tanque, a
 * película de 1 cm ao lado da célula submersa dava a reflexão total numa faixa escura grossa).
 *
 * A película que se rompe (`field_film_breaks`, por célula) não entra na leitura contínua: a água parada dela está em
 * gotas (`field_film_drops`: a árvore de quadrados do bloco de 2 × 2 células ao quarto de célula, cada quadrado uma gota
 * só ou dividido, a água de cada célula numa gota só), cada uma a calota do ângulo de contato com aquele volume,
 * alongada para baixo pela carga da borda (`field_film_drop_shape`). Fora delas o sólido está seco; a que corre é o
 * filete.
 *
 * A gota menor que a amostra (`footprint`: a largura da área que a amostra do pixel cobre na superfície, m; 0 no
 * ponto) entra pela média dela na amostra, como a filtragem de um mapa de alturas: a calota esticada até o raio ρ da
 * amostra, com a altura vezes a fração da área dela que a gota cobre, (a/ρ)².
 */
fn field_film_sample(p: vec3f, n: vec3f, footprint: f32) -> FieldFilmSample {
    let size = field_film_size();
    let layer = field_film_cell(p, n);
    let axes = field_film_axes(n);
    let u = axes.x;
    let v = axes.y;
    let g = p / size - 0.5;
    let center = vec2f(round(g[u]), round(g[v]));
    let f = vec2f(g[u], g[v]) - center;
    // Pesos da B-spline quadrática em −1, 0, 1 e as derivadas deles (por célula).
    let wu = vec3f(0.5 * (0.5 - f.x) * (0.5 - f.x), 0.75 - f.x * f.x, 0.5 * (0.5 + f.x) * (0.5 + f.x));
    let wv = vec3f(0.5 * (0.5 - f.y) * (0.5 - f.y), 0.75 - f.y * f.y, 0.5 * (0.5 + f.y) * (0.5 + f.y));
    let du = vec3f(f.x - 0.5, -2.0 * f.x, 0.5 + f.x);
    let dv = vec3f(f.y - 0.5, -2.0 * f.y, 0.5 + f.y);
    // As 4 × 4 células a partir de `base` (as 3 × 3 da leitura e o bloco de 2 × 2 das gotas do ponto).
    let cc = vec2i(center);
    let base = cc - vec2i(1);
    var cells: array<FieldFilmCell, 16>;
    // A página da última célula lida: as 4 × 4 cabem em uma a quatro páginas (uma sondagem por página).
    var page_of = 0u;
    var page = NONE;
    // A superfície do ponto: o κ e o cos θ da célula de maior κ.
    var kc = vec2f(0.0, 1.0);
    var hold = 0.0;
    for (var k = 0; k < 16; k++) {
        var c = layer;
        c[u] = base.x + (k % 4);
        c[v] = base.y + (k / 4);
        let pk = field_film_page_key(c, axes);
        if (pk != page_of) {
            page_of = pk;
            page = select(NONE, field_film_data_page(pk), field_film_key(c) != 0u);
        }
        cells[k] = field_film_cell_in(page, c, axes);
        if (cells[k].kappa > kc.x) {
            kc = vec2f(cells[k].kappa, cells[k].cos_t);
            hold = cells[k].hold;
        }
    }
    // A descida no plano (a gravidade ao longo do sólido).
    let g3 = fluid_field.filmFlow.xyz;
    let gt3 = g3 - dot(g3, n) * n;
    let gdir = vec2f(gt3[u], gt3[v]);
    let runs = length(gdir) > 1e-3;
    // A água das células que se rompem sai da leitura contínua: a parada vai às gotas (`drops`); a que corre, ao filete
    // (`rivulets`).
    var drops: array<f32, 16>;
    var rivulets: array<f32, 16>;
    // Na célula que corre, só o excesso sobre a espessura que a borda segura (a de `field_film_flow`) desce no filete; a
    // presa fica nas gotas — o rastro que o filete deixa.
    let gl_cells = length(gdir);
    for (var k = 0; k < 16; k++) {
        let h = cells[k].wet.x;
        let broken = field_film_breaks(h, cells[k].kappa, cells[k].critical);
        let running = broken && runs && cells[k].flowing;
        let pinned = select(h, cells[k].hold / (gl_cells * field_voxel()), runs);
        let excess = select(0.0, max(h - pinned, 0.0), running);
        drops[k] = select(0.0, h - excess, broken);
        rivulets[k] = excess;
        if (broken) { cells[k].wet.x = 0.0; }
    }
    // A leitura contínua só pelas células que não estão submersas, com os pesos renormalizados: junto à água do volume
    // a película termina nela (o menisco é a superfície do próprio volume), sem descer a zero na célula submersa — a
    // derivada até o zero dela inclinava a película ao contrário do menisco, numa faixa escura na linha d'água.
    var sum = vec2f(0.0);
    var dsum = vec2f(0.0);
    var dhsum = vec2f(0.0);
    var weight = 0.0;
    for (var k = 0; k < 9; k++) {
        let o = vec2i(k % 3, k / 3);
        let w = cells[o.x + 4 * o.y].wet;
        if (w.x < 0.0) { continue; }
        let wk = wu[o.x] * wv[o.y];
        let dk = vec2f(du[o.x] * wv[o.y], wu[o.x] * dv[o.y]);
        weight += wk;
        sum += wk * w.xy;
        dsum += dk;
        dhsum += dk * w.x;
    }
    var out: FieldFilmSample;
    // O ponto numa célula submersa: é a água do volume, sem película.
    if (cells[5].wet.x < 0.0) { return out; }
    var grad = vec2f(0.0);
    if (weight > 0.0) {
        out.wet = sum / weight;
        grad = (dhsum - dsum * (sum.x / weight)) / (weight * size);
    }
    // O ângulo de contato limita a inclinação (θ ≥ 90°: sem limite, a água não molha).
    let cos_t = kc.y;
    let sin_t = sqrt(max(1.0 - cos_t * cos_t, 0.0));
    let steep = length(grad);
    if (cos_t > 1e-3 && steep * cos_t > sin_t) { grad *= sin_t / (cos_t * steep); }
    var slope = vec3f(0.0);
    slope[u] = grad.x;
    slope[v] = grad.y;
    // A gota do quadrado do ponto e os filetes das 3 × 3 células: no ponto, a mais alta delas.
    let kappa = kc.x;
    let q = vec2f(p[u], p[v]);
    var best = 0.0;
    var best_slope = vec2f(0.0);
    if (kappa > 0.0) {
        let gl = length(gdir);
        let fall = select(vec2f(0.0, -1.0), gdir / max(gl, 1e-6), gl > 1e-3);
        let drop = field_film_drops(q, &drops, base, size, layer[3 - u - v], fall, gl, hold, sin_t, cos_t, footprint);
        best = drop.x;
        best_slope = drop.yz;
        // Os filetes: a água que corre pela célula numa faixa de seção em arco (`field_film_rivulet_width`) ao longo da
        // descida de verdade (não do eixo da grade mais próximo dela): do centro da célula, deslocado de lado por um
        // sorteio dela (o filete serpenteia, a linha de contato presa nos defeitos do sólido), ao da célula de baixo
        // pela descida quando ela também corre; senão a ponta — a gota que corre na frente dele.
        let lean = fall / max(max(abs(fall.x), abs(fall.y)), 1e-6);
        let step = vec2i(round(lean));
        let across = vec2f(-fall.y, fall.x);
        for (var k = 0; k < 9; k++) {
            let o = vec2i(k % 3, k / 3);
            let h = rivulets[o.x + 4 * o.y];
            if (h <= 0.0) { continue; }
            let down_o = o + step;
            let down_in = all(down_o >= vec2i(0)) && all(down_o < vec2i(4));
            let down_runs = !down_in || rivulets[down_o.x + 4 * down_o.y] > 0.0;
            let cell = base + o;
            let a = field_film_rivulet_center(cell, size, across, layer[3 - u - v]);
            let w = min(field_film_rivulet_width(h, size, cos_t), 0.8 * size);
            var b = a;
            if (down_runs && any(step != vec2i(0))) { b = field_film_rivulet_center(cell + step, size, across, layer[3 - u - v]); }
            let ab = b - a;
            let t = clamp(dot(q - a, ab) / max(dot(ab, ab), 1e-12), 0.0, 1.0);
            let band = field_film_cap_at(q - (a + t * ab), 0.5 * w, sin_t, cos_t, footprint, 1.0);
            if (band.x > best) {
                best = band.x;
                best_slope = band.yz;
            }
            if (!down_runs) {
                let head = field_film_cap_at(q - a, FIELD_FILM_RIVULET_HEAD * 0.5 * w, sin_t, cos_t, footprint, 2.0);
                if (head.x > best) {
                    best = head.x;
                    best_slope = head.yz;
                }
            }
        }
    }
    if (best > 0.0) {
        out.wet.x += best;
        slope[u] += best_slope.x;
        slope[v] += best_slope.y;
    }
    out.slope = slope - dot(slope, n) * n;
    return out;
}

/**
 * A película corre no ponto `p` da superfície de normal `n`: a célula dele ou uma das 8 em volta no plano teve água
 * descendo nos últimos passos (o filete; `field_film_step_main`).
 */
fn field_film_moving(p: vec3f, n: vec3f) -> bool {
    let layer = field_film_cell(p, n);
    let axes = field_film_axes(n);
    var page_of = 0u;
    var page = NONE;
    for (var k = 0; k < 9; k++) {
        var c = layer;
        c[axes.x] += k % 3 - 1;
        c[axes.y] += k / 3 - 1;
        let pk = field_film_page_key(c, axes);
        if (pk != page_of) {
            page_of = pk;
            page = select(NONE, field_film_data_page(pk), field_film_key(c) != 0u);
        }
        if (field_film_cell_in(page, c, axes).flowing) { return true; }
    }
    return false;
}

/**
 * A água livre (m) e a saturação dos poros no ponto `p` da superfície de normal `n` (`field_film_sample`), média na
 * largura `footprint` (m) do pixel.
 */
fn field_film_at(p: vec3f, n: vec3f, footprint: f32) -> vec2f {
    return field_film_sample(p, n, footprint).wet;
}

/**
 * A inclinação da película no ponto `p` da superfície de normal `n`: o gradiente da água livre no plano dela (m/m), média
 * na largura `footprint` (m) do pixel.
 */
fn field_film_slope(p: vec3f, n: vec3f, footprint: f32) -> vec3f {
    return field_film_sample(p, n, footprint).slope;
}
