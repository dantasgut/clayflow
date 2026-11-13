// Um passo da película de água nos sólidos por célula (`field_film.wgsl`, spec 034), na ordem: a superfície física da
// célula (resolvida uma vez: a do sólido mais próximo), a absorção pelos poros, a evaporação, o escoamento, o
// espalhamento no plano e a água pendente.
// - Submersa (a água do volume esteve ali no quadro anterior): a película é a própria água — fica a residual, e os
//   poros absorvem dela.
// - Absorção (Lucas–Washburn): a água absorvida por área cresce como A² = W t, tirada da água livre, até a capacidade.
// - Evaporação (Carrier, pela temperatura da superfície e o ar da cena): primeiro a água livre; seca por cima, a dos
//   poros, mais devagar (a taxa vezes a saturação).
// - Escoamento: a borda segura parada a espessura f / (ρ g_t ℓ) (Furmidge, com a histerese ampliada pela rugosidade; ℓ o
//   voxel do campo — o comprimento da água que a borda segura não muda com a resolução da película);
//   o excesso rompe a borda e desce ao longo do sólido na velocidade da película fina (Nusselt, freada pela
//   rugosidade) para a célula seguinte nessa direção — achada sobre a superfície do sólido (a distância aos colliders e
//   às paredes do domínio): seca, ela é criada (a água molha o que estava seco); com película, as duas se juntam. Atrás
//   fica a espessura presa. Onde o sólido acaba (uma quina) a água não tem por onde descer: fica pendente.
// - Espalhamento no plano (T066d; a lubrificação de película fina, Oron, Davis e Bankoff 1997): o fluxo entre a célula e
//   cada vizinha do plano (as oito, pelos pesos do laplaciano isotrópico) é h³ / (3ν) vezes a diferença da pressão
//   (`field_film_pressure_main`: o peso da coluna e a de Laplace, γ ∇²h). Para a vizinha seca a linha de contato segura a película até a altura em que o peso dela vence a
//   borda, √(2 f / (ρ g_n)) — a poça para de abrir.
// - Pendente (T066d): na face de baixo (o sólido não segura a água contra a gravidade) o que passa da altura da borda e
//   o que chega à quina viram água pendente; ela corre para baixo pela película e, no ponto mais baixo, junta-se na
//   maior (as gotas que pendem se juntam) até o pingo (`field_film_drip_main`).
// Na fatia do quadro do canal temporal da película (T060f; constituição VII): o passo lê cada célula da fatia anterior
// (`field_film_previous`) e a escreve na do quadro (`field_film_cells`, zerada antes), com o que chega das vizinhas. A
// célula sem nada (seca, sem água nos poros, sem pendente) sai da tabela.
// - Filetes (T066d): a película que escorre não desce em lâmina — a frente dela se desfaz em dedos (Huppert, "Flow and
//   instability of a viscous current down a slope", Nature 1982) e a água corre em filetes espaçados. A coluna de células
//   ao longo da descida é canal com probabilidade 1/3 (pelo hash dela: os filetes a ~3 células um do outro, ~2 cm, sem
//   grade); a água que escorre fora de um canal desce para a célula de baixo do lado do canal vizinho.
// Requer: WORKGROUP_SIZE, NONE, fluid_field, field_common, field_film, field_film_update, field_film_previous,
// field_film_pressure, field_film_solid, field_film_previous_read, random.

/** Células do alcance da gota que pende no máximo, para cada lado (o laço tem esse teto: 7 × 7 vizinhas). */
const FIELD_FILM_GATHER: i32 = 3;
/**
 * Fração da diferença de espessura que vai a uma vizinha num passo, no máximo, sobre o peso dela (o explícito sem
 * oscilar: a soma dos pesos é 10/3, e o total fica em 0,8).
 */
const FIELD_FILM_SPREAD_STEP: f32 = 0.24;
/**
 * O logaritmo da razão das escalas da cunha junto à linha de contato (Cox–Voinov: o tamanho da gota sobre o comprimento
 * molecular, ln(10⁻³ / 10⁻⁷) ≈ 9; Le Grand, Daerr & Limat 2005 ajustam 10 a 20).
 */
const FIELD_FILM_CONTACT_LOG: f32 = 10.0;

/** Espessura em unidades inteiras (arredondada). */
fn field_film_units(h: f32) -> u32 {
    return u32(max(h, 0.0) / FIELD_FILM_UNIT + 0.5);
}


/**
 * A vizinha `k` (0–7) da célula `c` no plano dos eixos `axes`: −u, +u, −v, +v e as quatro diagonais (−u −v, +u −v,
 * −u +v, +u +v).
 */
fn field_film_neighbor(c: vec3i, axes: vec2i, k: u32) -> vec3i {
    var d = vec3i(0);
    if (k < 4u) {
        d[select(axes.x, axes.y, k >= 2u)] = select(-1, 1, (k & 1u) == 1u);
    } else {
        d[axes.x] = select(-1, 1, (k & 1u) == 1u);
        d[axes.y] = select(-1, 1, k >= 6u);
    }
    return c + d;
}

/**
 * O peso da vizinha `k` no laplaciano isotrópico de nove pontos (2/3 nos eixos, 1/6 nas diagonais; a soma 10/3): o
 * espalhamento e a pressão de Laplace sem a direção preferida da grade — com as quatro vizinhas dos eixos, a mancha que
 * se abre sai quadrada (T066d).
 */
fn field_film_neighbor_weight(k: u32) -> f32 {
    return select(1.0 / 6.0, 2.0 / 3.0, k < 4u);
}

/** A água livre (m) da célula na palavra `w` da fatia anterior (0 sem ela ou submersa: ali é a própria água). */
fn field_film_previous_free(w: u32) -> f32 {
    if (w == NONE || field_film_previous[w + 3u] != 0u) { return 0.0; }
    return f32(field_film_previous[w + 1u]) * FIELD_FILM_UNIT;
}

/**
 * Pressão da película sobre a densidade (m²/s²) em cada célula do quadro anterior: o peso da coluna na face voltada
 * para cima (g_n h) menos a de Laplace (γ/ρ ∇²h, pelas vizinhas molhadas do plano: na linha de contato a inclinação é a
 * do ângulo dela, não um degrau até zero — a vizinha seca conta como a própria célula, sem fluxo pela borda).
 */
@compute @workgroup_size(WORKGROUP_SIZE)
fn field_film_pressure_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let slot = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    if (slot > fluid_field.film.y) { return; }
    let pw = field_film_cell_word(slot);
    let key = field_film_previous[pw];
    if (key == 0u || field_film_previous[pw + 3u] != 0u) {
        field_film_pressure[slot] = 0.0;
        return;
    }
    let size = field_film_size();
    let c = field_film_coords(key);
    let n = unpack4x8snorm(field_film_previous[pw + 2u]).xyz;
    let h = f32(field_film_previous[pw + 1u]) * FIELD_FILM_UNIT;
    let axes = field_film_previous_axes(slot);
    var laplacian = 0.0;
    for (var k = 0u; k < 8u; k++) {
        let nw = field_film_previous_word(field_film_neighbor(c, axes, k), axes);
        let around = select(h, field_film_previous_free(nw), nw != NONE && field_film_previous[nw + 3u] == 0u);
        laplacian += field_film_neighbor_weight(k) * (around - h);
    }
    laplacian /= size * size;
    let gn = max(-dot(fluid_field.filmFlow.xyz, n), 0.0);
    field_film_pressure[slot] = gn * h - fluid_field.filmShape.y * laplacian;
}

/** A pressão da célula na palavra `w` da fatia anterior (`field_film_pressure_main`). */
fn field_film_pressure_of(w: u32) -> f32 {
    return field_film_pressure[w / FIELD_FILM_WORDS];
}

/** A água livre `units` que fica na própria célula (palavra `w`). */
fn field_film_keep(w: u32, units: u32) {
    if (units > 0u) { atomicAdd(&field_film_cells[w + 1u], units); }
}

/** Soma `units` de água pendente à célula da palavra `w` na fatia do quadro. */
fn field_film_add_drop(w: u32, units: u32) {
    if (units > 0u) { atomicAdd(&field_film_cells[w + 6u], units); }
}

/**
 * A água livre `free_units` que pende na célula da palavra `w`: as unidades inteiras da pendente (cada uma
 * `FIELD_FILM_DROP_UNITS` da livre). Devolve as unidades da livre que passaram (o resto fica livre: nada se arredonda).
 */
fn field_film_hang(w: u32, free_units: u32) -> u32 {
    let drops = free_units / FIELD_FILM_DROP_UNITS;
    field_film_add_drop(w, drops);
    return drops * FIELD_FILM_DROP_UNITS;
}

/**
 * A água que desce da célula `c` (de normal `n` e água livre `free_units`) para a seguinte sobre o sólido, já somada a
 * ela na fatia do quadro: o excesso sobre a espessura presa pela borda, na velocidade da película fina. Onde o sólido
 * acaba (a seguinte sai dele), o excesso fica pendente na própria célula (palavra `w`). Devolve as unidades que saíram
 * da água livre (0 sem escoamento).
 */
/** A coluna `column` da camada `layer` (o eixo da descida `along`) é canal de filete (probabilidade 1/3, pelo hash)? */
fn field_film_channel(layer: i32, column: i32, along: i32) -> bool {
    return hash3(bitcast<vec3u>(vec3i(layer, column, along)) ^ vec3u(0x5BD1E995u, 0x68E31DA4u, 0x1B56C4E9u)) % 3u == 0u;
}

/**
 * O passo lateral (−1, 0 ou 1 no eixo de lado do plano) da água que escorre da célula `c` no plano dos eixos `axes`,
 * descendo no eixo `along` (0 ou 1 dos eixos): 0 num canal; fora dele, para o canal vizinho (o do hash, se os dois); sem
 * canal ao lado, 0 (a coluna leva o próprio filete).
 */
fn field_film_toward_channel(c: vec3i, axes: vec2i, along: i32) -> i32 {
    let side = select(axes.x, axes.y, along == 0);
    let layer = c[3 - axes.x - axes.y];
    let column = c[side];
    if (field_film_channel(layer, column, along)) { return 0; }
    let left = field_film_channel(layer, column - 1, along);
    let right = field_film_channel(layer, column + 1, along);
    if (left && right) { return select(-1, 1, (hash3(bitcast<vec3u>(vec3i(layer, column, along))) & 1u) == 1u); }
    if (left) { return -1; }
    if (right) { return 1; }
    return 0;
}

fn field_film_flow(c: vec3i, w: u32, n: vec3f, free_units: u32, terms: vec4f, cos_t: f32, spread: f32, dt: f32)
    -> u32 {
    let size = field_film_size();
    let h = f32(free_units) * FIELD_FILM_UNIT;
    let g = fluid_field.filmFlow.xyz;
    let gt = g - dot(g, n) * n;
    let gl = length(gt);
    if (gl <= 1e-3 || fluid_field.filmFlow.w <= 0.0) { return 0u; }
    // A espessura presa pela borda da célula (os defeitos do sólido, `field_film_defect`).
    let excess = h - terms.x * field_film_defect(c, spread) / (gl * field_voxel());
    if (excess <= 0.0) { return 0u; }
    // A velocidade: a da película fina de Nusselt, limitada na molhagem parcial (θ > 0) pela dissipação na linha de
    // contato da frente (Kim, Lee & Kang 2002; Le Grand, Daerr & Limat 2005): o peso que passa da borda por largura, ρ
    // g_t ℓ (h − h_presa), contra a cunha 3 μ U ln Λ / θ — a gota pouco acima do limiar desce a poucos cm/s.
    var u = terms.y * gl * h * h / (3.0 * fluid_field.filmFlow.w);
    if (cos_t < 1.0) {
        let theta = acos(clamp(cos_t, -1.0, 1.0));
        u = min(u, theta * gl * field_voxel() * excess / (3.0 * fluid_field.filmFlow.w * FIELD_FILM_CONTACT_LOG));
    }
    let moved = min(free_units, field_film_units(excess * min(1.0, u * dt / size)));
    if (moved == 0u) { return 0u; }
    // A célula seguinte sobre a superfície do sólido: a vizinha na direção da descida, levada à superfície pela normal da
    // própria célula; a página dela, a do plano da normal do sólido ali. No plano (a vizinha a um quarto de célula da
    // face, como a própria, e a normal perto de um eixo) é a da própria célula; fora dele (a esfera entre as faces, a
    // quina, a parede fina) a normal do sólido ali é medida: a dominante pode mudar (a água que desce passa às páginas
    // da face de lado, as que a leitura de lá procura), e a face do outro lado do sólido (a parede de vidro mais fina
    // que duas células: a distância medida até a face de fora) não recebe — a água não atravessa o sólido.
    // A descida e, fora dos canais, o passo de lado para o canal vizinho (no plano da célula).
    var step = vec3i(round(gt / gl));
    let axes = field_film_axes(n);
    let along = select(1, 0, abs(gt[axes.x]) >= abs(gt[axes.y]));
    let lateral = field_film_toward_channel(c, axes, along);
    if (lateral != 0) { step[select(axes.x, axes.y, along == 0)] += lateral; }
    let q = (vec3f(c + step) + 0.5) * size;
    let d = field_film_solid(q);
    var next = c;
    var normal = n;
    if (abs(d) <= 1.5 * size) {
        let a = abs(n);
        if (max(a.x, max(a.y, a.z)) < 0.9 || d < 0.0 || d > 0.75 * size) {
            normal = field_film_solid_normal(q - d * n);
        }
        if (dot(normal, n) > -0.5) { next = field_film_cell(q - d * n, normal); }
    }
    // A quina: não há sólido por onde descer — a água fica pendente nela.
    if (all(next == c)) { return field_film_hang(w, moved); }
    let next_axes = field_film_axes(normal);
    // A cheia (no anterior) não recebe mais.
    let before = field_film_previous_word(next, next_axes);
    if (before != NONE && f32(field_film_previous[before + 1u]) * FIELD_FILM_UNIT >= FIELD_FILM_MAX) { return 0u; }
    let below = field_film_find(next, next_axes, true);
    if (below == NONE) { return 0u; }
    let bw = field_film_cell_word(below);
    // A água molha o que estava seco: a célula nasce com a normal do sólido ali (também a do anterior sem nada, que o
    // passo dela tiraria).
    if (before == NONE || (field_film_previous[before + 1u] == 0u && field_film_previous[before + 4u] == 0u
        && field_film_previous[before + 6u] == 0u)) {
        let fresh = field_film_solid_normal(q);
        atomicMax(&field_film_cells[bw + 2u], pack4x8snorm(vec4f(fresh, 0.0)));
    }
    atomicAdd(&field_film_cells[bw + 1u], moved);
    // A água chega correndo: a célula de baixo é parte do filete.
    atomicAdd(&field_film_cells[bw + 7u], moved);
    return moved;
}

/**
 * O espalhamento no plano da célula `c` (palavra `pw` no anterior; o plano dos eixos `axes`, os da página dela): a água
 * que vai a cada vizinha do plano pela diferença de pressão, já somada a ela. Devolve as unidades que saíram.
 */
fn field_film_spread(
    c: vec3i,
    axes: vec2i,
    pw: u32,
    n: vec3f,
    free_units: u32,
    terms: vec4f,
    dt: f32,
) -> u32 {
    let nu = fluid_field.filmFlow.w;
    if (free_units == 0u || nu <= 0.0) { return 0u; }
    let size = field_film_size();
    let h = f32(free_units) * FIELD_FILM_UNIT;
    let gn = max(-dot(fluid_field.filmFlow.xyz, n), 0.0);
    // A altura que a linha de contato segura contra a vizinha seca: ρ g_n h² / 2 = f.
    let hold = select(3.0e38, sqrt(2.0 * terms.x / gn), gn > 1e-3);
    let pi = field_film_pressure_of(pw);
    let mobility = terms.y * dt * h * h * h / (3.0 * nu * size * size);
    let packed = pack4x8snorm(vec4f(n, 0.0));
    var sent = 0u;
    for (var k = 0u; k < 8u; k++) {
        let nc = field_film_neighbor(c, axes, k);
        let weight = field_film_neighbor_weight(k);
        let nw = field_film_previous_word(nc, axes);
        var hj = 0.0;
        var pj = 0.0;
        if (nw != NONE) {
            if (field_film_previous[nw + 3u] != 0u) { continue; }
            // Só a muito cheia (`FIELD_FILM_FULL`, no anterior) não recebe: a pressão decide até a escala das partículas.
            hj = f32(field_film_previous[nw + 1u]) * FIELD_FILM_UNIT;
            if (hj >= FIELD_FILM_FULL) { continue; }
            pj = field_film_pressure_of(nw);
        } else {
            // A vizinha seca: a borda segura até a altura dela; e a vizinha tem de estar sobre o sólido.
            if (h <= hold || abs(field_film_solid((vec3f(nc) + 0.5) * size)) > size) { continue; }
        }
        if (pi <= pj || h <= hj) { continue; }
        let out = weight * min(mobility * (pi - pj), FIELD_FILM_SPREAD_STEP * (h - hj));
        let units = min(field_film_units(out), free_units - sent);
        if (units == 0u) { continue; }
        let slot = field_film_find(nc, axes, true);
        if (slot == NONE) { continue; }
        let tw = field_film_cell_word(slot);
        if (nw == NONE) { atomicMax(&field_film_cells[tw + 2u], packed); }
        atomicAdd(&field_film_cells[tw + 1u], units);
        sent += units;
    }
    return sent;
}

/**
 * Quanto a célula `c` está abaixo (na direção da gravidade `g`): o centro dela levado à superfície do sólido — a mesma
 * medida para todas (a pendente desce só para a mais baixa: nenhum par troca água entre si).
 */
fn field_film_low(c: vec3i, g: vec3f) -> f32 {
    let center = (vec3f(c) + 0.5) * field_film_size();
    return dot(center - field_film_solid(center) * field_film_solid_normal(center), g);
}

/**
 * A água pendente da célula `c` (normal `n`, `drop_units` no anterior) corre pela face de baixo na direção da
 * gravidade ao longo do sólido: a célula da película um ou dois lados de célula adiante, levada à superfície (a seca
 * que ela molha nasce com a normal dali). Onde não desce mais (o ponto mais baixo, a quina horizontal), vai para a
 * maior gota da mesma altura que a alcança (o raio dela; empate: a de chave menor) — as gotas que pendem se juntam na
 * maior; sem nenhuma, fica.
 */
fn field_film_gather_drop(c: vec3i, key: u32, w: u32, n: vec3f, drop_units: u32) {
    let size = field_film_size();
    let g = fluid_field.filmFlow.xyz;
    let gt = g - dot(g, n) * n;
    let gl = length(gt);
    if (gl > 0.01 * length(g)) {
        let here = field_film_low(c, g);
        for (var step = 1; step <= 2; step++) {
            let q = (vec3f(c) + 0.5) * size + gt / gl * (size * f32(step));
            let d = field_film_solid(q);
            if (abs(d) > 2.0 * size) { break; }
            let normal = field_film_solid_normal(q);
            let next = field_film_cell(q - d * normal, normal);
            if (all(next == c) || field_film_low(next, g) <= here) { continue; }
            let slot = field_film_find(next, field_film_axes(normal), true);
            if (slot == NONE) { break; }
            let tw = field_film_cell_word(slot);
            // A normal do sólido ali (a célula pode ser nova, ou a do anterior que o passo dela tiraria por seca).
            atomicMax(&field_film_cells[tw + 2u], pack4x8snorm(vec4f(normal, 0.0)));
            field_film_add_drop(tw, drop_units);
            return;
        }
    }
    // No ponto mais baixo: a gota que pende alcança as vizinhas da mesma altura até o raio dela (a meia esfera do volume
    // pendente) — a menor vai para a maior que a alcança; a maior cresce e alcança mais (as gotas se juntam numa só).
    let axes = field_film_axes(normalize(g));
    let unit = f32(FIELD_FILM_DROP_UNITS) * FIELD_FILM_UNIT * size * size;
    var best = drop_units;
    var dest = c;
    var best_key = key;
    for (var k = 0; k < (2 * FIELD_FILM_GATHER + 1) * (2 * FIELD_FILM_GATHER + 1); k++) {
        let du = k % (2 * FIELD_FILM_GATHER + 1) - FIELD_FILM_GATHER;
        let dv = k / (2 * FIELD_FILM_GATHER + 1) - FIELD_FILM_GATHER;
        if (du == 0 && dv == 0) { continue; }
        var nc = c;
        nc[axes.x] += du;
        nc[axes.y] += dv;
        let nw = field_film_previous_word(nc, axes);
        if (nw == NONE || field_film_previous[nw + 3u] != 0u) { continue; }
        let other = field_film_previous[nw + 6u];
        if (other == 0u) { continue; }
        let reach = pow(0.4774648 * f32(other) * unit, 1.0 / 3.0) / size + 0.5;
        if (f32(du * du + dv * dv) > reach * reach) { continue; }
        let other_key = field_film_previous[nw];
        if (other > best || (other == best && other_key < best_key)) {
            best = other;
            dest = nc;
            best_key = other_key;
        }
    }
    if (all(dest == c)) {
        field_film_add_drop(w, drop_units);
        return;
    }
    let slot = field_film_find(dest, axes, true);
    if (slot == NONE) {
        field_film_add_drop(w, drop_units);
        return;
    }
    field_film_add_drop(field_film_cell_word(slot), drop_units);
}

@compute @workgroup_size(WORKGROUP_SIZE)
fn field_film_step_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let slot = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    if (slot > fluid_field.film.y) { return; }
    // A célula do quadro anterior (a fatia anterior do canal); ela vai à fatia do quadro com o passo aplicado.
    let pw = field_film_cell_word(slot);
    let key = field_film_previous[pw];
    if (key == 0u) { return; }
    let dt = fluid_field.contact.z;
    let size = field_film_size();
    let c = field_film_coords(key);
    let axes = field_film_previous_axes(slot);
    var surface = field_film_previous[pw + 5u];
    if (surface == 0u) {
        // A célula nova: a superfície do sólido dela — e, sem sólido junto (o disco da deposição que passou da quina),
        // ela sai (a residual no ar não é película).
        let center = (vec3f(c) + 0.5) * size;
        if (abs(field_film_solid(center)) > 1.5 * size && field_film_previous[pw + 6u] == 0u) { return; }
        surface = field_film_surface_at(center) + 1u;
    }
    let packed_normal = field_film_previous[pw + 2u];
    // (borda / ρ, 1 / rugosidade, Washburn, capacidade) e a evaporação.
    let terms = field_film_surface(surface - 1u, 0u);
    let evaporation = field_film_surface(surface - 1u, 1u).x;
    let absorbed_units = field_film_previous[pw + 4u];
    var absorbed = f32(absorbed_units) * FIELD_FILM_UNIT;
    let drop_units = field_film_previous[pw + 6u];
    // A água que os poros aceitam neste passo (Washburn: A² cresce W dt), até a capacidade.
    let soak = max(min(terms.w, sqrt(absorbed * absorbed + terms.z * dt)) - absorbed, 0.0);
    if (field_film_previous[pw + 3u] != 0u) {
        let own = field_film_find(c, axes, true);
        if (own == NONE) { return; }
        let w = field_film_cell_word(own);
        atomicStore(&field_film_cells[w + 5u], surface);
        atomicMax(&field_film_cells[w + 2u], packed_normal);
        // Sob a água, a película é a residual; a água livre além dela (a que desceu pelo sólido até a água do volume, a
        // da gota passada à película) se junta ao volume: passa à pendente, que volta a ser partícula no pingo — nada
        // some sob a água. Antes ela ficava livre na célula submersa e, quando o nível baixava (a água que balança no
        // tanque), aparecia de uma vez como película de até 1 cm logo acima da linha d'água: a faixa escura grossa.
        let residual = field_film_units(FIELD_FILM_RESIDUAL);
        let before = field_film_previous[pw + 1u];
        let joined = select(0u, (before - residual) / FIELD_FILM_DROP_UNITS, before > residual);
        field_film_keep(w, max(before - joined * FIELD_FILM_DROP_UNITS, residual));
        atomicStore(&field_film_cells[w + 4u], absorbed_units + field_film_units(soak));
        field_film_add_drop(w, drop_units + joined);
        return;
    }
    var free_units = field_film_previous[pw + 1u];
    // Absorção, da água livre.
    let take = min(free_units, field_film_units(soak));
    free_units -= take;
    absorbed += f32(take) * FIELD_FILM_UNIT;
    // Evaporação: a água livre; o tempo que sobra depois dela seca os poros na taxa decrescente.
    let free = f32(free_units) * FIELD_FILM_UNIT;
    let dry = evaporation * dt;
    let gone = min(free_units, field_film_units(dry));
    var absorbed_after = absorbed;
    if (dry > free && evaporation > 0.0 && terms.w > 0.0) {
        let rest = (dry - free) / evaporation;
        absorbed_after = max(absorbed - evaporation * (absorbed / terms.w) * rest, 0.0);
    }
    free_units -= gone;
    let after_units = field_film_units(absorbed_after);
    // Seca de todo (nada livre, nada nos poros, nada pendente): a célula sai da tabela (as vizinhas a recriam se a água
    // chegar).
    if (free_units == 0u && after_units == 0u && drop_units == 0u) { return; }
    let own = field_film_find(c, axes, true);
    if (own == NONE) { return; }
    let w = field_film_cell_word(own);
    atomicStore(&field_film_cells[w + 5u], surface);
    atomicMax(&field_film_cells[w + 2u], packed_normal);
    atomicStore(&field_film_cells[w + 4u], after_units);
    let n = unpack4x8snorm(packed_normal).xyz;
    // A face de baixo: o que passa da altura que a borda segura contra o peso pende.
    let g = fluid_field.filmFlow.xyz;
    let gn = dot(g, n);
    if (gn > 1e-3) {
        let hang = sqrt(2.0 * terms.x / gn);
        if (f32(free_units) * FIELD_FILM_UNIT > hang) {
            free_units -= field_film_hang(w, min(field_film_units(f32(free_units) * FIELD_FILM_UNIT - hang), free_units));
        }
    }
    // Escoamento do excesso sobre a espessura presa, depois o espalhamento no plano; o que fica, na própria célula.
    let moved = field_film_flow(c, w, n, free_units, terms, field_film_surface(surface - 1u, 1u).y,
        field_film_surface(surface - 1u, 2u).x, dt);
    free_units -= moved;
    // O escoamento da célula: a água que desceu dela agora e a metade do do passo anterior (o filete que corre
    // intermitente — o excesso sai em unidades inteiras — não pisca entre filete e gotas; parado, some em poucos passos e
    // o que ficou para trás se rompe em gotas: o rastro).
    let flowing = moved + field_film_previous[pw + 7u] / 2u;
    if (flowing > 0u) { atomicAdd(&field_film_cells[w + 7u], flowing); }
    free_units -= field_film_spread(c, axes, pw, n, free_units, terms, dt);
    field_film_keep(w, free_units);
    if (drop_units > 0u) { field_film_gather_drop(c, key, w, n, drop_units); }
}
