// Sondas de tela extras (spec 034, T058; as sondas adaptativas do Lumen): depois da colocação das sondas dos ladrilhos,
// uma invocação por posição fina (as três de cada ladrilho a meio ladrilho: à direita, abaixo, na diagonal). Onde a
// interpolação nela atravessa uma dobra côncava — a sonda do ladrilho e alguma das outras da interpolação (t + (dx, 0),
// t + (0, dy), t + d) com as normais a mais de 70°, cada uma à frente do plano da outra: a dobra entre o teto e a
// parede, o objeto pousado no chão —, a luz muda depressa (o teto escurece ao chegar na parede) e a grade dos
// ladrilhos, na diagonal da dobra, desenha manchas em escada no período dela. Ali a posição lança o raio da câmera e,
// com o ponto atingido também na dobra e fora da linha dela (`gi_screen_adapt_around`), ocupa uma vaga (contador
// atômico; sem vaga, fica como estava) com posição, normal, a decisão de lançar (como na colocação) e o texel fino, e
// marca o mapa fino do ladrilho — dos dois lados da dobra. A sonda extra segue o caminho das dos ladrilhos (guia,
// raios, acúmulo, filtro e desenho). A borda convexa, a silhueta contra o fundo e a superfície curva ficam com as
// sondas dos ladrilhos. Os argumentos dos despachos indiretos das sondas de tela saem daqui também
// (`gi_screen_args_main`).
// Requer: WORKGROUP_SIZE, NONE, gi, gi_screen_common, gi_screen_reproject, ray_scene, cameras, gi_screen_work,
// gi_screen_adapt_count, gi_screen_args.

/**
 * Cosseno entre as normais abaixo do qual duas sondas vizinhas formam uma dobra (70°: a quina entre paredes, o objeto
 * no chão — não a curvatura de uma superfície vista de longe, onde a grade dos ladrilhos basta).
 */
const GI_SCREEN_ADAPT_CREASE: f32 = 0.34;

/** Tolerância de plano das sondas de tela no ponto `p` (cresce com a distância à câmera, como na leitura do desenho). */
fn gi_screen_adapt_tolerance(p: vec3f) -> f32 {
    return 0.01 + length(p - cameras[gi.screen.w].position.xyz) * 0.01;
}

/** As sondas `p` (normal `n`) e `q` (normal `qn`) formam uma dobra côncava? */
fn gi_screen_adapt_concave(p: vec3f, n: vec3f, q: vec3f, qn: vec3f, tolerance: f32) -> bool {
    // Côncava: cada uma à frente do plano da outra (perto da dobra as duas distâncias ficam pequenas; a soma decide o
    // lado — na convexa as duas são negativas), as normais a mais de 70° e perto.
    let d = q - p;
    let front = dot(d, n);
    let back = dot(-d, qn);
    return dot(qn, n) < GI_SCREEN_ADAPT_CREASE && front + back > 0.1 * tolerance && min(front, back) > -tolerance
        && length(d) < 0.1 * length(p - cameras[gi.screen.w].position.xyz);
}

/** A sonda do ladrilho `t` (posição em xyz, w > 0 com superfície) e a normal; w = 0 fora da grade. */
struct GiScreenAdaptProbe {
    p: vec4f,
    n: vec3f,
}

fn gi_screen_adapt_probe(t: vec2u) -> GiScreenAdaptProbe {
    if (any(t >= gi.screen.xy)) { return GiScreenAdaptProbe(vec4f(0.0), vec3f(0.0)); }
    let at = gi_screen_probe_at(t.x + t.y * gi.screen.x);
    return GiScreenAdaptProbe(gi_screen_work[at], gi_screen_work[at + 1u].xyz);
}

/**
 * O ponto `p` (normal `n`) forma dobra côncava com alguma das sondas da interpolação na posição fina de deslocamento
 * `d` além da do ladrilho (t + (dx, 0), t + (0, dy), t + d)?
 */
fn gi_screen_adapt_across(tile: vec2u, d: vec2u, p: vec3f, n: vec3f, tolerance: f32) -> bool {
    for (var o = 1u; o < 4u; o++) {
        let s = vec2u(o & 1u, o >> 1u) * d;
        if (all(s == vec2u(0u))) { continue; }
        let q = gi_screen_adapt_probe(tile + s);
        if (q.p.w > 0.0 && gi_screen_adapt_concave(p, n, q.p.xyz, q.n, tolerance)) { return true; }
    }
    return false;
}

/**
 * O ponto atingido `p` (normal `n`) em relação às 3 × 3 sondas em volta do ladrilho: `x` se forma dobra côncava com
 * alguma, `y` se está colado ao plano de alguma noutra superfície (em cima da linha da dobra: ali os raios para a outra
 * parede partem de trás dela, pelo erro do acerto, e trazem a luz de fora — a posição fica com as sondas dos dois
 * lados).
 */
fn gi_screen_adapt_around(tile: vec2u, p: vec3f, n: vec3f, tolerance: f32) -> vec2<bool> {
    var crease = false;
    for (var o = 0u; o < 9u; o++) {
        let t = vec2i(tile) + vec2i(i32(o % 3u) - 1, i32(o / 3u) - 1);
        if (any(t < vec2i(0))) { continue; }
        let q = gi_screen_adapt_probe(vec2u(t));
        if (q.p.w <= 0.0 || dot(q.n, n) >= GI_SCREEN_ADAPT_CREASE) { continue; }
        if (abs(dot(p - q.p.xyz, q.n)) < 0.25 * tolerance) { return vec2<bool>(false, true); }
        crease = crease || gi_screen_adapt_concave(p, n, q.p.xyz, q.n, tolerance);
    }
    return vec2<bool>(crease, false);
}

/** Uma invocação por posição fina: o mapa fino vazio e, onde a interpolação atravessa uma dobra côncava, o raio e a vaga. */
@compute @workgroup_size(WORKGROUP_SIZE)
fn gi_screen_adapt_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let j = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    if (j >= 3u * gi_screen_count()) { return; }
    let index = j / 3u;
    let k = j % 3u;
    let map = gi_screen_map_at(index, k);
    // Sem sonda extra até a posição ganhar uma vaga.
    gi_screen_work[map] = vec4f(0.0);
    let tile = vec2u(index % gi.screen.x, index / gi.screen.x);
    let d = gi_screen_fine_offset(k);
    let t = 2u * tile + d;
    if (!gi_screen_fine_inside(vec2i(t))) { return; }
    // Sem raio fora das dobras: só a posição cuja interpolação atravessa uma dobra côncava com a sonda do ladrilho.
    let own = gi_screen_adapt_probe(tile);
    if (own.p.w <= 0.0 || !gi_screen_adapt_across(tile, d, own.p.xyz, own.n, gi_screen_adapt_tolerance(own.p.xyz))) {
        return;
    }
    let ray = gi_camera_ray(gi_screen_fine_pixel(t));
    let max_dist = gi.tuning.w * 4.0;
    let hit = ray_scene_hit(ray.origin, ray.dir, max_dist);
    if (hit.t >= max_dist || hit.face < 0.0) { return; }
    let n = select(hit.normal, -hit.normal, dot(hit.normal, ray.dir) > 0.0);
    let tolerance = gi_screen_adapt_tolerance(hit.position);
    // O ponto atingido também na dobra com alguma das 3 × 3 em volta e fora da linha dela.
    let around = gi_screen_adapt_around(tile, hit.position, n, tolerance);
    if (!around.x || around.y) { return; }
    let slot = atomicAdd(&gi_screen_adapt_count[0], 1u);
    if (slot >= gi.screen1.w) { return; }
    let at = gi_screen_probe_at(gi_screen_count() + slot);
    gi_screen_work[at] = vec4f(hit.position, hit.t);
    let launch = gi_screen_scheduled(tile) || !gi_screen_history_found(gi_screen_history_taps(hit.position, n));
    gi_screen_work[at + 1u] = vec4f(n, select(0.5, 1.0, launch));
    gi_screen_work[gi_screen_meta_at(slot)] = vec4f(vec2f(t), 0.0, 0.0);
    gi_screen_work[map] = vec4f(f32(slot + 1u), 0.0, 0.0, 0.0);
}

/** Os grupos (x, y, 1) do despacho indireto de `invocations` invocações a partir de `at` nos argumentos. */
fn gi_screen_args_put(at: u32, invocations: u32) {
    let groups = max((invocations + WORKGROUP_SIZE - 1u) / WORKGROUP_SIZE, 1u);
    let x = min(groups, 65535u);
    gi_screen_args[at] = x;
    gi_screen_args[at + 1u] = (groups + x - 1u) / x;
    gi_screen_args[at + 2u] = 1u;
}

/**
 * Os argumentos dos despachos indiretos das sondas de tela pelas vagas ocupadas no quadro (antes de o guia zerar o
 * contador): a partir de 0, uma invocação por sonda (as dos ladrilhos e as extras ocupadas — o guia, o acúmulo e o
 * filtro); a partir de 4, uma por raio delas (o acerto e a soma dos raios). As vagas vazias não despacham.
 */
@compute @workgroup_size(WORKGROUP_SIZE)
fn gi_screen_args_main(@builtin(global_invocation_id) gid: vec3u) {
    if (gid.x != 0u) { return; }
    let probes = gi_screen_count() + min(atomicLoad(&gi_screen_adapt_count[0]), gi.screen1.w);
    gi_screen_args_put(0u, probes);
    gi_screen_args_put(4u, probes * gi.screen.z);
}
