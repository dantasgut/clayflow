// O caminho traçado da refração (spec 034, R1, T044), uma amostra do raio de um pixel (`refraction_sample`): o raio
// da câmera, a partir do plano próximo como o raster, parte da pilha de meios da câmera (`refraction_frame`). Na
// primeira interface os dois lobos são traçados — a reflexão e a transmissão, cada uma com o Fresnel por canal; com
// dispersão, a transmissão é um caminho por canal, com o índice do canal em toda interface seguinte. Na segunda
// interface de cada um os dois lobos de novo (`refraction_path_split`: a reflexão interna de 4 % entra em toda amostra
// com o peso dela, não numa a cada 25 — o histórico vê a mudança dela no quadro em que acontece), e um caminho por
// canal se a dispersão começa nela. Nas seguintes um lobo: o raro é olhado antes e, se termina no acerto seguinte, entra
// com o peso exato e o caminho segue pelo outro (T065i: sem os vagalumes da roleta); senão a roleta de Fresnel (sem
// viés: o acúmulo converge); onde
// a dispersão começa e a roleta escolhe a transmissão, um caminho por canal dali em diante (T065g: o vidro meio dentro
// da água; sortear o canal com o triplo do peso somava 2 ao ruído relativo). Cada trecho é absorvido no meio corrente
// (Beer–Lambert). No acerto opaco: a emissão, a luz direta com raio de sombra (`ray_direct`) e a luz rebatida da cena
// (`scene_indirect_lighting`: as sondas da GI, ou o hemisfério); no escape, o ambiente (`scene_environment`). Depois de
// `max_interfaces` interfaces (ou de um meio além do teto da pilha) a energia restante conta como absorvida (a
// luminância dela sai à parte). O fechamento com transmissão parcial é dielétrico com a probabilidade do peso dela,
// opaco no resto. A parede fina (`closure_thin_walled`) não muda a pilha: reflete com 2R/(1 + R) ou atravessa sem
// desviar. Com a normal do material, as interfaces refletem e refratam por ela (`refraction_shading_normal`); a
// geométrica decide o lado e a pilha. Sai também o ponto em que termina o caminho que mais contribui para a cor, com o registro do objeto, e o
// albedo da superfície nele (`closure_albedo`; 1 no céu e sem superfície).
// Determinística: o mesmo raio, o mesmo estado aleatório e a mesma cena dão a mesma amostra. Sai também se o caminho
// a parte da radiância que veio por caminhos que tocaram uma instância que se moveu desde o quadro anterior
// (`moving`: quem acumula o sinal encurta o histórico na proporção dela).
// Requer: NONE, refraction, refraction_interface, refraction_media, ray_scene, ray_hit, camera_space, ray_direct,
// closure_eval, scene_environment, scene_indirect_lighting, refraction_frame.

/** Distância máxima dos raios. */
const REFRACTION_FAR: f32 = 1.0e6;
/**
 * Teto de passos de um caminho: cada passo é um acerto, e todo acerto em interface conta no limite de interfaces (até
 * 32, `REFRACTION_MAX_INTERFACES`), então o caminho acaba antes; o teto só garante que nenhum laço prenda a GPU.
 */
const REFRACTION_STEP_LIMIT: u32 = 34u;

/**
 * Peso mínimo do caminho (por canal, desde a câmera) para olhar o lobo raro antes da roleta (T065i). Abaixo dele — os
 * ramos da reflexão de Fresnel das duas primeiras interfaces, de 4 % no vidro fora do rasante — o lobo raro só faria
 * vagalume (4× a média do pixel) vendo algo 40× mais claro que o pixel, e olhar custa um traçado a mais em toda
 * interface: na lente, a reflexão interna acha o próprio vidro de novo (+10 ms em 33).
 */
const REFRACTION_LOOK_WEIGHT: f32 = 0.1;

/**
 * Origem do raio que sai da interface no ponto `p` (face `nf`) na direção `dir`: andando sobre a própria linha do raio
 * até ficar a 2e-4·(tamanho das coordenadas) da superfície — a precisão do ponto cai com elas. Afastar pela normal
 * desloca a linha de lado, e numa lupa (ampliação forte perto das dobras da cáustica) uma fração de milímetro no ponto
 * de saída cria ou apaga traços inteiros da imagem.
 */
fn refraction_departure(p: vec3f, nf: vec3f, dir: vec3f) -> vec3f {
    let gap = 2e-4 * max(1.0, max(abs(p.x), max(abs(p.y), abs(p.z))));
    return p + dir * (gap / max(abs(dot(dir, nf)), 0.05));
}

/** Estado aleatório da amostra do pixel `pixel` (índice linear) no quadro `frame`. */
fn refraction_seed(pixel: u32, frame: u32) -> u32 {
    return random_seed(RANDOM_STREAM_REFRACTION, pixel, frame);
}

/** Número uniforme em [0, 1) do estado do caminho. */
fn refraction_random(state: ptr<function, u32>) -> f32 {
    return random_unit(random_next(state));
}

/** A pilha de meios da câmera no quadro. */
fn refraction_camera_stack() -> RefractionStack {
    var s = refraction_empty_stack();
    for (var k = 0u; k < REFRACTION_MAX_MEDIA; k++) {
        let a = textureLoad(refraction_frame, vec2u(2u * k, 0u), 0);
        let b = textureLoad(refraction_frame, vec2u(2u * k + 1u, 0u), 0);
        if (a.x == NONE) { continue; }
        s.media[s.count] = RefractionMedium(a.x, bitcast<f32>(a.y), bitcast<vec3f>(vec3u(a.zw, b.x)),
            bitcast<vec3f>(b.yzw));
        s.count += 1u;
    }
    return s;
}

/** O fechamento é uma interface dielétrica (com a probabilidade do peso da transmissão)? */
fn refraction_takes_interface(c: Closure, state: ptr<function, u32>) -> bool {
    if (c.transmission_weight <= 0.0) { return false; }
    return c.transmission_weight >= 1.0 || refraction_random(state) < c.transmission_weight;
}

/** A instância do acerto se moveu desde o quadro anterior? */
fn refraction_hit_moved(hit: RayHit) -> bool {
    return ray_instance_moved_at(ray_scene_info.instanceFirst + hit.instance * RAY_INSTANCE_WORDS);
}

/**
 * Luz que sai de um ponto opaco atingido para quem vê de `v` (rgb); no w, 1 quando a sombra dele vem de uma instância
 * que se moveu (a luz do ponto muda sem que o ponto mude: a marca de movimento vale para ele).
 */
fn refraction_shade(c: Closure, hit: RayHit, v: vec3f, seed: u32) -> vec4f {
    let n = select(hit.normal, -hit.normal, dot(hit.normal, v) < 0.0);
    let direct = ray_direct_marked(c, hit.position, n, v, refraction.light_count, seed);
    return vec4f(closure_emitted(c, n, v) + direct.xyz + scene_indirect_lighting(c, hit.position, n, v), direct.w);
}

/**
 * Refletância da parede fina (`closure_thin_walled`) por canal: a placa de espessura zero no meio `outside`, com as
 * reflexões múltiplas entre as duas faces somadas, R + T²R/(1 − R²) = 2R/(1 + R), R o Fresnel da face (a referência).
 */
fn refraction_thin_reflectance(c: Closure, outside: RefractionMedium, cos_i: f32) -> vec3f {
    let slab = closure_dispersion_iors(c.transmission_ior, c.transmission_abbe);
    var out: vec3f;
    for (var k = 0; k < 3; k++) {
        let r = refraction_fresnel(cos_i, outside.ior[k], slab[k]);
        out[k] = 2.0 * r / (1.0 + r);
    }
    return out;
}

/** Direção espelhada de `d` na face `nf`. */
fn refraction_mirror(d: vec3f, nf: vec3f) -> vec3f {
    return d - nf * (2.0 * dot(d, nf));
}

/**
 * Os lobos da parede fina no acerto `hit` (fechamento `c`) para o raio `d` no meio `outside`: o reflexo pela normal de
 * sombreamento (0 se cai atrás da face) e a passagem sem desvio, com a refletância 2R/(1 + R) pelo cosseno nela.
 */
struct RefractionThin {
    nf: vec3f,
    reflect_dir: vec3f,
    reflect_weight: vec3f,
    transmit_weight: vec3f,
}

fn refraction_thin(c: Closure, hit: RayHit, d: vec3f, outside: RefractionMedium) -> RefractionThin {
    let nf = select(hit.normal, -hit.normal, dot(hit.normal, d) > 0.0);
    let ns = refraction_shading_normal(c.normal, hit.normal, nf, d);
    let f = refraction_thin_reflectance(c, outside, abs(dot(d, ns)));
    let r = refraction_mirror(d, ns);
    return RefractionThin(nf, r, select(f, vec3f(0.0), dot(r, nf) <= 0.0), vec3f(1.0) - f);
}

/**
 * O que a interface atingida faz com a pilha: os cruzamentos (o da instância atingida e, se houver, o da dielétrica
 * coincidente — `count` 1 ou 2), os meios antes e depois, a face voltada para o raio e a rugosidade. Os cruzamentos, não
 * a pilha de depois: quem segue o caminho os aplica à própria pilha (pilhas inteiras em cada passo esgotam os
 * registradores e derrubam a ocupação do traçado).
 */
struct RefractionCrossing {
    p: vec3f,
    nf: vec3f,
    /** A normal de sombreamento (a do material no sentido de `nf`; sem ela, `nf`). */
    ns: vec3f,
    first: RefractionCross,
    second: RefractionCross,
    count: u32,
    before: RefractionMedium,
    next: RefractionMedium,
    /** A borda é interface (`crosses`: muda o meio corrente)? */
    crosses: bool,
    alpha: f32,
}

/** O cruzamento da borda da instância do acerto `hit` (fechamento `c`). */
fn refraction_cross_of(hit: RayHit, c: Closure) -> RefractionCross {
    return RefractionCross(refraction_medium(c, hit.instance), hit.face < 0.0);
}

/** A pilha `s` depois dos cruzamentos da interface `x`. */
fn refraction_crossed(s: RefractionStack, x: RefractionCrossing) -> RefractionStack {
    let one = refraction_applied(s, x.first);
    if (x.count > 1u) { return refraction_applied(one, x.second); }
    return one;
}

/**
 * A interface no acerto `hit` (fechamento `c`) do raio (o, d) — e a dielétrica coincidente, se houver (outra instância a
 * menos de 1e-5·(1 + t)), cruzadas juntas, como a referência.
 */
fn refraction_crossing(o: vec3f, d: vec3f, hit: RayHit, c: Closure, s: RefractionStack) -> RefractionCrossing {
    var out: RefractionCrossing;
    out.p = hit.position;
    out.nf = select(hit.normal, -hit.normal, dot(hit.normal, d) > 0.0);
    out.ns = refraction_shading_normal(c.normal, hit.normal, out.nf, d);
    out.first = refraction_cross_of(hit, c);
    out.count = 1u;
    var rough = c.transmission_roughness;
    // Só o trecho [t − tol, t + tol] em volta do acerto: a hierarquia desce só pelos nós que contêm o ponto (o custo é a
    // profundidade dela, não outra travessia inteira).
    let tol = 1e-5 * (1.0 + hit.t);
    let start = max(hit.t - tol, 0.0);
    let other = ray_scene_hit_excluding(o + d * start, d, hit.t + tol - start, hit.instance);
    if (other.instance != NONE) {
        let c2 = ray_hit_closure(other, refraction.time, 0.0);
        if (c2.transmission_weight > 0.0) {
            out.second = refraction_cross_of(other, c2);
            out.count = 2u;
            rough = max(rough, c2.transmission_roughness);
        }
    }
    out.before = refraction_current(s);
    out.next = refraction_current(refraction_crossed(s, out));
    out.crosses = out.before.instance != out.next.instance;
    out.alpha = rough * rough;
    return out;
}

/**
 * Resultado de um caminho: a radiância, a energia que restava no limite de interfaces (por canal), onde ele termina —
 * o ponto de mundo e, em bits, o registro `Renderable` do objeto (`NONE`: o céu, ou sem registro) — e o albedo da
 * superfície nesse ponto (1 no céu e sem superfície) — e a parte da radiância que veio por caminhos que tocaram uma
 * instância que se moveu (`moving`).
 */
struct RefractionPath {
    radiance: vec3f,
    truncated: vec3f,
    end: vec4f,
    albedo: vec3f,
    moving: vec3f,
}

/** Fim de um caminho no ponto `p` do registro `record`. */
fn refraction_end(p: vec3f, record: u32) -> vec4f {
    return vec4f(p, bitcast<f32>(record));
}

/**
 * O que um trecho de caminho acha no acerto seguinte: o fim (`done`: a radiância do opaco ou do céu, ou `truncated` 1 no
 * limite de interfaces; sem a absorção), uma borda que não muda o meio (`passes`: o raio segue reto depois dos
 * cruzamentos) ou uma interface — a absorção até ela (`through`, com o canal sorteado na dispersão já separado), a
 * probabilidade da reflexão na roleta e os dois lobos que saem dela, com o peso de cada um (o Fresnel vezes o peso do
 * lobo); a reflexão fica na pilha, a transmissão (e a passagem) aplicam os cruzamentos (`first` e `second`, `count`
 * deles: 0 na parede fina). O nó não leva pilha: quem segue o caminho guarda a sua (pilhas inteiras em cada passo
 * esgotam a memória da invocação). `end` e `albedo`: onde o trecho termina (o fim, ou a interface se o lobo seguido se
 * perde).
 */
struct RefractionNode {
    done: bool,
    /** A instância do acerto se moveu desde o quadro anterior. */
    moved: bool,
    passes: bool,
    radiance: vec3f,
    truncated: f32,
    end: vec4f,
    albedo: vec3f,
    through: vec3f,
    p: vec3f,
    nf: vec3f,
    interfaces: u32,
    channel: i32,
    p_reflect: f32,
    reflect_dir: vec3f,
    reflect_weight: vec3f,
    transmit_dir: vec3f,
    transmit_weight: vec3f,
    first: RefractionCross,
    second: RefractionCross,
    count: u32,
    /**
     * A dispersão começa nesta interface e quem segue abre um caminho por canal:
     * a microfaceta `m`, as normais e α dela e os índices dos dois lados, por canal, para `refraction_branches`.
     */
    disperse: bool,
    m: vec3f,
    ns: vec3f,
    alpha: f32,
    ior_before: vec3f,
    ior_next: vec3f,
}

/** Teto de ramos de uma interface: a reflexão e a transmissão, ou a reflexão e um caminho por canal. */
const REFRACTION_BRANCHES: u32 = 4u;

/**
 * Os ramos de uma interface: direção, peso por canal, canal seguido (−1 = os três) e se leva a pilha de depois dos
 * cruzamentos.
 */
struct RefractionBranches {
    dirs: array<vec3f, REFRACTION_BRANCHES>,
    weights: array<vec3f, REFRACTION_BRANCHES>,
    channels: array<i32, REFRACTION_BRANCHES>,
    crossed: array<bool, REFRACTION_BRANCHES>,
    count: u32,
}

/**
 * Os ramos de uma interface dielétrica com a microfaceta `m` (em volta de `ns`, face geométrica `nf`, α) entre os
 * índices por canal `before` e `next`: a reflexão com o Fresnel de cada canal e, com `dispersive`, um caminho por canal
 * (o índice do canal em toda interface seguinte), senão um só pelo verde.
 */
fn refraction_branches(d: vec3f, m: vec3f, ns: vec3f, nf: vec3f, alpha: f32, before: vec3f, next: vec3f,
    dispersive: bool) -> RefractionBranches {
    var b: RefractionBranches;
    b.count = 0u;
    let cos_m = dot(-d, m);
    let f = vec3f(
        refraction_fresnel(cos_m, before.x, next.x),
        refraction_fresnel(cos_m, before.y, next.y),
        refraction_fresnel(cos_m, before.z, next.z),
    );
    let r = refraction_reflect(d, m, ns, nf, alpha);
    if (r.weight > 0.0) {
        b.dirs[b.count] = r.dir;
        b.weights[b.count] = f * r.weight;
        b.channels[b.count] = -1;
        b.crossed[b.count] = false;
        b.count += 1u;
    }
    if (dispersive) {
        for (var k = 0; k < 3; k++) {
            let t = refraction_transmit(d, m, ns, nf, before[k], next[k], alpha);
            if (t.weight <= 0.0) { continue; }
            var only = vec3f(0.0);
            only[k] = (1.0 - f[k]) * t.weight;
            b.dirs[b.count] = t.dir;
            b.weights[b.count] = only;
            b.channels[b.count] = k;
            b.crossed[b.count] = true;
            b.count += 1u;
        }
    } else {
        let t = refraction_transmit(d, m, ns, nf, before.y, next.y, alpha);
        if (t.weight > 0.0) {
            b.dirs[b.count] = t.dir;
            b.weights[b.count] = vec3f((1.0 - f.y) * t.weight);
            b.channels[b.count] = -1;
            b.crossed[b.count] = true;
            b.count += 1u;
        }
    }
    return b;
}

/** A pilha `s` depois dos cruzamentos do nó `n`. */
fn refraction_after_node(s: RefractionStack, n: RefractionNode) -> RefractionStack {
    var out = s;
    if (n.count > 0u) { out = refraction_applied(out, n.first); }
    if (n.count > 1u) { out = refraction_applied(out, n.second); }
    return out;
}

/**
 * O acerto seguinte do raio (o, d) na pilha `stack` no canal `channel` (−1 = os três), depois de `interfaces`. Na
 * interface em que a dispersão começa volta `disperse`, para quem segue abrir um caminho por canal.
 */
fn refraction_advance(o: vec3f, d: vec3f, stack: RefractionStack, channel: i32, interfaces: u32,
    state: ptr<function, u32>) -> RefractionNode {
    var n: RefractionNode;
    n.done = true;
    n.disperse = false;
    n.moved = false;
    n.passes = false;
    n.radiance = vec3f(0.0);
    n.truncated = 0.0;
    n.albedo = vec3f(1.0);
    n.channel = channel;
    n.interfaces = interfaces;
    n.count = 0u;
    let hit = ray_scene_hit(o, d, REFRACTION_FAR);
    n.through = refraction_absorb(vec3f(1.0), refraction_current(stack), min(hit.t, REFRACTION_FAR));
    if (hit.instance == NONE) {
        n.radiance = scene_environment(d);
        n.end = refraction_end(o + d * REFRACTION_FAR, NONE);
        return n;
    }
    let c = ray_hit_closure(hit, refraction.time, 0.0);
    n.end = refraction_end(hit.position, hit.renderable);
    n.moved = refraction_hit_moved(hit);
    if (!refraction_takes_interface(c, state)) {
        let shade = refraction_shade(c, hit, -d, *state);
        n.radiance = shade.xyz;
        n.moved = n.moved || shade.w > 0.0;
        n.albedo = closure_albedo(c);
        return n;
    }
    n.interfaces += 1u;
    if (n.interfaces > refraction.max_interfaces || stack.overflow != 0u) {
        n.truncated = 1.0;
        return n;
    }
    n.done = false;
    if (c.transmission_thin > 0.0) {
        // Parede fina: a pilha não muda; reflete pela refletância (a roleta pela do canal seguido, ou pela do verde) ou
        // atravessa sem desviar.
        let thin = refraction_thin(c, hit, d, refraction_current(stack));
        let f = thin.reflect_weight;
        n.p = hit.position;
        n.nf = thin.nf;
        n.p_reflect = clamp(select(f.y, f[max(n.channel, 0)], n.channel >= 0), 1e-4, 1.0 - 1e-4);
        n.reflect_dir = thin.reflect_dir;
        n.reflect_weight = f;
        n.transmit_dir = d;
        n.transmit_weight = thin.transmit_weight;
        return n;
    }
    let x = refraction_crossing(o, d, hit, c, stack);
    n.p = x.p;
    n.nf = x.nf;
    n.first = x.first;
    n.second = x.second;
    n.count = x.count;
    if (!x.crosses) {
        n.passes = true;
        return n;
    }
    if (n.channel < 0 && (refraction_dispersive(x.before) || refraction_dispersive(x.next))) {
        // A dispersão começa aqui: quem segue abre um caminho por canal.
        n.disperse = true;
        n.alpha = x.alpha;
        n.ns = x.ns;
        n.ior_before = x.before.ior;
        n.ior_next = x.next.ior;
        n.m = refraction_microfacet(d, x.ns, x.alpha, vec2f(refraction_random(state), refraction_random(state)));
        return n;
    }
    let n1 = refraction_ior(x.before, n.channel);
    let n2 = refraction_ior(x.next, n.channel);
    let alpha = x.alpha;
    let u = vec2f(refraction_random(state), refraction_random(state));
    let m = refraction_microfacet(d, x.ns, alpha, u);
    let f = refraction_fresnel(dot(-d, m), n1, n2);
    let r = refraction_reflect(d, m, x.ns, x.nf, alpha);
    let t = refraction_transmit(d, m, x.ns, x.nf, n1, n2, alpha);
    n.p_reflect = f;
    n.reflect_dir = r.dir;
    n.reflect_weight = vec3f(f * r.weight);
    n.transmit_dir = t.dir;
    n.transmit_weight = vec3f((1.0 - f) * t.weight);
    return n;
}

/** O fim do nó terminal `n` com o peso acumulado `throughput` (já com a absorção do trecho). */
fn refraction_finish(n: RefractionNode, throughput: vec3f, moved: bool) -> RefractionPath {
    let radiance = throughput * n.radiance;
    let moving = select(vec3f(0.0), radiance, moved || n.moved);
    return RefractionPath(radiance, throughput * n.truncated, n.end, n.albedo, moving);
}

/** Um caminho e se ele parou na transmissão da interface em que a dispersão começa (`pending`). */
struct RefractionWalk {
    path: RefractionPath,
    pending: bool,
}

/**
 * A luz já somada de um caminho pelos lobos raros resolvidos de antemão (T065i): a radiância, a parte dela que veio
 * por algo em movimento e a energia que restava no limite de interfaces.
 */
struct RefractionGathered {
    radiance: vec3f,
    moving: vec3f,
    truncated: vec3f,
}

/** Caminho perdido (sem luz além da já somada `g`) que termina em `end`. */
fn refraction_lost(end: vec4f, pending: bool, g: RefractionGathered) -> RefractionWalk {
    return RefractionWalk(RefractionPath(g.radiance, g.truncated, end, vec3f(1.0), g.moving), pending);
}

/** O caminho `p` com a luz já somada `g`. */
fn refraction_with(p: RefractionPath, g: RefractionGathered) -> RefractionPath {
    return RefractionPath(p.radiance + g.radiance, p.truncated + g.truncated, p.end, p.albedo, p.moving + g.moving);
}

/**
 * `g` com a luz do nó terminal `n` (o acerto seguinte de um lobo resolvido de antemão) pelo peso `weight` (o do
 * caminho até a interface vezes o do lobo); `moved`: o caminho até a interface tocou algo em movimento.
 */
fn refraction_gather(g: RefractionGathered, n: RefractionNode, weight: vec3f, moved: bool) -> RefractionGathered {
    let w = weight * n.through;
    let radiance = w * n.radiance;
    return RefractionGathered(g.radiance + radiance, g.moving + select(vec3f(0.0), radiance, moved || n.moved),
        g.truncated + w * n.truncated);
}

/**
 * Caminho a partir de (o0, d0) com a pilha `stack0` no canal `channel0` (−1 = os três), depois de `interfaces0`: um
 * lobo por interface até um opaco, o escape ou o limite. Em cada interface o lobo raro (a probabilidade de Fresnel
 * menor que 1/2) é olhado antes (T065i): se o acerto seguinte dele termina o caminho dele (um opaco, o céu, o limite),
 * a luz dele entra com o peso exato e o caminho segue pelo outro, sem roleta — a roleta mandava o lobo raro com o peso
 * 1/F numa amostra em 1/F (2–4 % na água e no vidro vistos de fora): um vagalume onde ele vê algo mais claro. Se o lobo
 * raro segue adiante, a roleta de Fresnel como antes (sem viés: o acúmulo converge), e o acerto já traçado é o passo
 * seguinte quando ela escolhe o raro. Na interface em que a dispersão começa, o mesmo com a reflexão (os três canais
 * juntos) quando ela é a rara; a roleta escolhe entre ela e a transmissão: com `forced` −1 o caminho para ali
 * (`pending`, com a luz já somada); com `forced` = k — a repetição do mesmo caminho com o mesmo estado aleatório, que
 * chega à mesma interface pelas mesmas escolhas — a transmissão segue no canal k (T065g), e só a luz somada dali em
 * diante conta (a de antes já está no caminho que parou).
 */
fn refraction_path(o0: vec3f, d0: vec3f, stack0: RefractionStack, channel0: i32, interfaces0: u32, forced: i32,
    weight0: vec3f, state: ptr<function, u32>) -> RefractionWalk {
    var o = o0;
    var d = d0;
    var stack = stack0;
    var channel = channel0;
    var interfaces = interfaces0;
    var throughput = vec3f(1.0);
    var moved = false;
    var gathered = RefractionGathered(vec3f(0.0), vec3f(0.0), vec3f(0.0));
    var counting = forced < 0;
    for (var step = 0u; step < REFRACTION_STEP_LIMIT; step++) {
        let n = refraction_advance(o, d, stack, channel, interfaces, state);
        throughput *= n.through;
        if (n.done) {
            return RefractionWalk(refraction_with(refraction_finish(n, throughput, moved), gathered), false);
        }
        moved = moved || n.moved;
        channel = n.channel;
        interfaces = n.interfaces;
        if (n.passes) {
            stack = refraction_after_node(stack, n);
            o = refraction_departure(n.p, n.nf, d);
            continue;
        }
        // A interface: a reflexão e a transmissão, a probabilidade da reflexão na roleta e qual lobo é o raro. Onde a
        // dispersão começa, a roleta é pela média do Fresnel dos canais e a transmissão é um caminho por canal (os
        // pesos divididos pela probabilidade: sem viés para qualquer escolha dela).
        var f = n.reflect_weight;
        var p_reflect = n.p_reflect;
        var reflect_dir = n.reflect_dir;
        var reflect_weight = n.reflect_weight;
        if (n.disperse) {
            let cos_m = dot(-d, n.m);
            f = vec3f(
                refraction_fresnel(cos_m, n.ior_before.x, n.ior_next.x),
                refraction_fresnel(cos_m, n.ior_before.y, n.ior_next.y),
                refraction_fresnel(cos_m, n.ior_before.z, n.ior_next.z),
            );
            p_reflect = clamp((f.x + f.y + f.z) / 3.0, 1e-4, 1.0 - 1e-4);
            let r = refraction_reflect(d, n.m, n.ns, n.nf, n.alpha);
            reflect_dir = r.dir;
            reflect_weight = f * r.weight;
        }
        // O lobo raro (na dispersão, só a reflexão: a transmissão é um caminho por canal).
        let rare_reflect = p_reflect <= 0.5;
        let rare_weight = select(n.transmit_weight, reflect_weight, rare_reflect);
        var resolved = (rare_reflect || !n.disperse) && all(rare_weight <= vec3f(0.0));
        // A roleta sorteada antes de olhar o lobo raro, e o estado de antes de olhar: se ela escolhe o raro, o passo
        // seguinte retraça o mesmo acerto com os mesmos números (guardar o nó olhado entre os passos custava
        // registradores e tempo).
        let u = refraction_random(state);
        let rewind = *state;
        var looked = false;
        if (!resolved && (rare_reflect || !n.disperse) && any(weight0 * throughput >= vec3f(REFRACTION_LOOK_WEIGHT))) {
            let rare_dir = select(n.transmit_dir, reflect_dir, rare_reflect);
            var rare_stack = stack;
            if (!rare_reflect) { rare_stack = refraction_after_node(stack, n); }
            let ahead = refraction_advance(refraction_departure(n.p, n.nf, rare_dir), rare_dir, rare_stack, channel,
                interfaces, state);
            resolved = ahead.done;
            looked = true;
            if (resolved && counting) { gathered = refraction_gather(gathered, ahead, throughput * rare_weight, moved); }
        }
        // Resolvido o raro, o outro lobo sem roleta; senão a roleta.
        let crossed = select(u >= p_reflect, rare_reflect, resolved);
        var dir = select(reflect_dir, n.transmit_dir, crossed);
        var weight = select(reflect_weight, n.transmit_weight, crossed)
            / select(select(p_reflect, 1.0 - p_reflect, crossed), 1.0, resolved);
        if (looked && !resolved && crossed != rare_reflect) { *state = rewind; }
        if (n.disperse && crossed) {
            if (forced < 0) { return refraction_lost(n.end, true, gathered); }
            let t = refraction_transmit(d, n.m, n.ns, n.nf, n.ior_before[forced], n.ior_next[forced], n.alpha);
            dir = t.dir;
            weight = vec3f(0.0);
            weight[forced] = (1.0 - f[forced]) * t.weight / select(1.0 - p_reflect, 1.0, resolved);
            channel = forced;
            counting = true;
        }
        if (all(weight <= vec3f(0.0))) { return refraction_lost(n.end, false, gathered); }
        throughput *= weight;
        d = dir;
        if (crossed) { stack = refraction_after_node(stack, n); }
        o = refraction_departure(n.p, n.nf, d);
    }
    // O teto de passos: a energia que resta conta como no limite de interfaces.
    return RefractionWalk(refraction_with(RefractionPath(vec3f(0.0), throughput, refraction_end(o, NONE), vec3f(1.0),
        vec3f(0.0)), gathered), false);
}

/**
 * Caminho a partir de (o, d) com os dois lobos na interface seguinte (cada um continuado por `refraction_path`): a
 * soma pesada pelo Fresnel, sem roleta nessa interface. O fim é o do lobo que mais contribui para a cor.
 */
fn refraction_path_split(o0: vec3f, d: vec3f, stack0: RefractionStack, channel0: i32, interfaces0: u32,
    weight0: vec3f, state: ptr<function, u32>) -> RefractionPath {
    var o = o0;
    var stack = stack0;
    var channel = channel0;
    var interfaces = interfaces0;
    var through = vec3f(1.0);
    var moved = false;
    var n: RefractionNode;
    // Até a interface seguinte (as bordas que não mudam o meio são atravessadas).
    for (var step = 0u; step <= REFRACTION_STEP_LIMIT; step++) {
        if (step == REFRACTION_STEP_LIMIT) {
            return RefractionPath(vec3f(0.0), through, refraction_end(o, NONE), vec3f(1.0), vec3f(0.0));
        }
        n = refraction_advance(o, d, stack, channel, interfaces, state);
        through *= n.through;
        if (n.done) { return refraction_finish(n, through, moved); }
        moved = moved || n.moved;
        channel = n.channel;
        interfaces = n.interfaces;
        if (!n.passes) { break; }
        stack = refraction_after_node(stack, n);
        o = refraction_departure(n.p, n.nf, d);
    }
    var out = RefractionPath(vec3f(0.0), vec3f(0.0), n.end, vec3f(1.0), vec3f(0.0));
    var best = -1.0;
    // O albedo é a média dos lobos pesada pela luz de cada um (o guia de textura do filtro: com o refletido dominando
    // num ângulo rasante, a textura vista pelo transmitido ainda aparece nele, na proporção da luz dela).
    var albedo = vec3f(0.0);
    var light = 0.0;
    // Os ramos: os dois lobos, ou a reflexão e um caminho por canal onde a dispersão começa.
    var b: RefractionBranches;
    if (n.disperse) {
        b = refraction_branches(d, n.m, n.ns, n.nf, n.alpha, n.ior_before, n.ior_next, true);
    } else {
        b.dirs[0] = n.reflect_dir;
        b.weights[0] = n.reflect_weight;
        b.channels[0] = channel;
        b.crossed[0] = false;
        b.dirs[1] = n.transmit_dir;
        b.weights[1] = n.transmit_weight;
        b.channels[1] = channel;
        b.crossed[1] = true;
        b.count = 2u;
    }
    // Num laço: uma chamada só de `refraction_path` (o compilador expande cada chamada; um laço em volta dela custava
    // 7 % na lente). Por ramo, o caminho (`forced` −1) e, se ele parou onde a dispersão começa, a repetição dele em cada
    // canal, com o estado aleatório do início do ramo.
    var start = *state;
    var pending = false;
    for (var job = 0u; job < 4u * b.count; job++) {
        let k = job / 4u;
        let forced = i32(job % 4u) - 1;
        let w = b.weights[k];
        if (all(w <= vec3f(0.0))) { continue; }
        if (forced < 0) {
            start = *state;
        } else if (!pending) {
            continue;
        } else {
            *state = start;
        }
        let dir = b.dirs[k];
        var lobe = stack;
        if (b.crossed[k]) { lobe = refraction_after_node(stack, n); }
        let walk = refraction_path(refraction_departure(n.p, n.nf, dir), dir, lobe, b.channels[k], interfaces, forced,
            weight0 * through * w, state);
        if (forced < 0) {
            pending = walk.pending;
            if (pending) {
                // A luz dos lobos raros resolvidos antes da interface em que a dispersão começa (as repetições por
                // canal só somam a de depois dela).
                out.radiance += through * w * walk.path.radiance;
                out.moving += through * w * select(walk.path.moving, walk.path.radiance, moved || n.moved);
                out.truncated += through * w * walk.path.truncated;
                continue;
            }
        }
        let r = walk.path;
        let radiance = through * w * r.radiance;
        out.radiance += radiance;
        // Tudo o que o lobo traz se o trecho até a interface (ou ela) tocou algo em movimento.
        out.moving += through * w * select(r.moving, r.radiance, moved || n.moved);
        out.truncated += through * w * r.truncated;
        albedo += luminance(radiance) * r.albedo;
        light += luminance(radiance);
        if (luminance(radiance) > best) {
            best = luminance(radiance);
            out.end = r.end;
            out.albedo = r.albedo;
        }
    }
    if (light > 0.0) { out.albedo = albedo / light; }
    return out;
}

/**
 * Uma amostra do pixel: a radiância (a transmitida mais a refletida na primeira interface), a luminância da energia
 * truncada, o fim do caminho que mais contribui (e o peso dele), o albedo da superfície nesse fim e a parte da
 * radiância que veio por caminhos que tocaram uma instância que se moveu.
 */
struct RefractionSample {
    radiance: vec3f,
    truncated: f32,
    end: vec4f,
    end_weight: f32,
    albedo: vec3f,
    moving: vec3f,
}

/**
 * Uma amostra do raio da câmera `ray` (a roleta, a microfaceta e as luzes pelo estado `state`). A primeira interface
 * monta os ramos (direção, peso por canal, canal seguido e se leva a pilha de depois dos cruzamentos) e cada um continua
 * por `refraction_path_split` num laço — uma chamada só.
 */
fn refraction_sample(ray: RayCamera, stack: RefractionStack, state: ptr<function, u32>)
    -> RefractionSample {
    var out = RefractionSample(vec3f(0.0), 0.0, refraction_end(ray.origin + ray.dir * REFRACTION_FAR, NONE), -1.0,
        vec3f(1.0), vec3f(0.0));
    // O raio parte do plano próximo, como o raster (o que fica antes dele não é visto); o meio da câmera absorve desde
    // ela.
    let start = ray.origin + ray.dir * ray.near;
    let d = ray.dir;
    let hit = ray_scene_hit(start, d, REFRACTION_FAR);
    let through = refraction_absorb(vec3f(1.0), refraction_current(stack), min(hit.t + ray.near, REFRACTION_FAR));
    if (hit.instance == NONE) {
        out.radiance = through * scene_environment(d);
        return out;
    }
    let c = ray_hit_closure(hit, refraction.time, 0.0);
    let first_moved = refraction_hit_moved(hit);
    if (!refraction_takes_interface(c, state)) {
        // Borda em que o raio e o raster discordam, ou a parte opaca de um transmissivo parcial.
        let shade = refraction_shade(c, hit, -d, *state);
        out.radiance = through * shade.xyz;
        out.moving = select(vec3f(0.0), out.radiance, first_moved || shade.w > 0.0);
        out.end = refraction_end(hit.position, hit.renderable);
        out.end_weight = luminance(out.radiance);
        out.albedo = closure_albedo(c);
        return out;
    }
    var b: RefractionBranches;
    b.count = 0u;
    var p = hit.position;
    var nf = select(hit.normal, -hit.normal, dot(hit.normal, d) > 0.0);
    var after = stack;
    if (c.transmission_thin > 0.0) {
        // Parede fina na primeira interface: o reflexo e a passagem direta, a pilha da câmera nos dois.
        let thin = refraction_thin(c, hit, d, refraction_current(stack));
        b.dirs[0] = thin.reflect_dir;
        b.weights[0] = thin.reflect_weight;
        b.channels[0] = -1;
        b.crossed[0] = false;
        b.dirs[1] = d;
        b.weights[1] = thin.transmit_weight;
        b.channels[1] = -1;
        b.crossed[1] = false;
        b.count = 2u;
    } else {
        let x = refraction_crossing(start, d, hit, c, stack);
        after = refraction_crossed(stack, x);
        p = x.p;
        nf = x.nf;
        if (!x.crosses) {
            // A borda não muda o meio: segue reto, na pilha de depois.
            b.dirs[0] = d;
            b.weights[0] = vec3f(1.0);
            b.channels[0] = -1;
            b.crossed[0] = true;
            b.count = 1u;
        } else {
            // Primeira interface: a mesma microfaceta para os dois lobos; o Fresnel por canal; com dispersão, um
            // caminho por canal.
            let u = vec2f(refraction_random(state), refraction_random(state));
            let m = refraction_microfacet(d, x.ns, x.alpha, u);
            b = refraction_branches(d, m, x.ns, x.nf, x.alpha, x.before.ior, x.next.ior,
                refraction_dispersive(x.before) || refraction_dispersive(x.next));
        }
    }
    // O albedo: a média dos ramos pesada pela luz de cada um (como em `refraction_path_split`).
    var albedo = vec3f(0.0);
    var light = 0.0;
    for (var i = 0u; i < b.count; i++) {
        var lobe = stack;
        if (b.crossed[i]) { lobe = after; }
        let r = refraction_path_split(refraction_departure(p, nf, b.dirs[i]), b.dirs[i], lobe, b.channels[i], 1u,
            through * b.weights[i], state);
        // Por canal, a luminância do que ele soma: o caminho do ramo mais forte.
        let radiance = through * b.weights[i] * r.radiance;
        out.radiance += radiance;
        out.truncated += luminance(through * b.weights[i] * r.truncated);
        out.moving += through * b.weights[i] * select(r.moving, r.radiance, first_moved);
        albedo += luminance(radiance) * r.albedo;
        light += luminance(radiance);
        if (luminance(radiance) > out.end_weight) {
            out.end = r.end;
            out.end_weight = luminance(radiance);
            out.albedo = r.albedo;
        }
    }
    if (light > 0.0) { out.albedo = albedo / light; }
    return out;
}
