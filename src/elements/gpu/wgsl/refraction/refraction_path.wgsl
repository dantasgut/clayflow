// As peças do caminho traçado da refração (spec 034, R1, T044) — o nó de um acerto pelos fechamentos já avaliados
// (`refraction_node_at`), a interface, os ramos, a parede fina, a luz no opaco —, seguidas em ondas por `refraction_wave`
// (spec 039: o material avaliado fora do traçado). Uma amostra do raio de um pixel: o raio da câmera, a partir do plano próximo como o raster, parte da pilha de meios da câmera (`refraction_frame`). Na
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
// Os acertos são os de `refraction_scene` (a malha ou a superfície de um volume, a água das partículas: T065e).
// Requer: NONE, refraction, refraction_interface, refraction_media, refraction_scene, ray_scene, ray_hit, camera_space,
// ray_direct, closure_eval, scene_environment, scene_indirect_lighting, refraction_frame.

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
        s.media[s.count] = refraction_medium_of(a.x, bitcast<f32>(a.y), bitcast<vec3f>(vec3u(a.zw, b.x)),
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
 * O brilho das luzes de disco (as direcionais com raio angular, `cones.z`: o sol) refletido por uma interface dielétrica
 * (a água, o vidro) para quem vê de `v`, no ponto `p` de normal de face `nf` (rgb; no w, 1 quando a sombra vem de uma
 * instância que se moveu): a luz direta pelo lobo refletido do fechamento `c` (a transmissão não entra: só a luz do
 * lado de quem vê), com sombra, a rugosidade somada à do disco (as larguras em quadratura) — o reflexo de uma luz de
 * tamanho real. A luz sem disco (uma direção, um ponto) não tem reflexo visível na superfície lisa, como na referência;
 * o caminho refletido nunca acerta a luz: este é o único termo dela ali, sem contagem dupla.
 */
fn refraction_glint(c: Closure, p: vec3f, nf: vec3f, v: vec3f) -> vec4f {
    let n = select(nf, -nf, dot(nf, v) < 0.0);
    let count = min(min(refraction.light_count, arrayLength(&lights)), LIGHT_LIMIT);
    let r = max(c.specular_roughness, BSDF_MIN_ROUGHNESS);
    var sum = vec4f(0.0);
    for (var i = 0u; i < count; i++) {
        let light = lights[i];
        let disc = light.cones.z;
        if (light.kind != 0u || disc <= 0.0) { continue; }
        var g = c;
        g.specular_roughness = sqrt(sqrt(r * r * r * r + disc * disc));
        let response = ray_light_response(g, i, p, n, v, true);
        sum = vec4f(sum.xyz + response.xyz, max(sum.w, response.w));
    }
    return sum;
}

/**
 * Refletância da parede fina (`closure_thin_walled`) por canal: a placa de espessura zero no meio `outside`, com as
 * reflexões múltiplas entre as duas faces somadas, R + T²R/(1 − R²) = 2R/(1 + R), R o Fresnel da face (a referência).
 */
fn refraction_thin_reflectance(c: Closure, outside: RefractionMedium, cos_i: f32) -> vec3f {
    let slab = closure_dispersion_iors(c.transmission_ior, c.transmission_abbe);
    var out: vec3f;
    for (var k = 0; k < 3; k++) {
        let r = refraction_fresnel(cos_i, refraction_medium_ior(outside)[k], slab[k]);
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
 * A dielétrica coincidente com o acerto `hit` do raio (o, d): outra instância a menos de 1e-5·(1 + t) — só o trecho
 * [t − tol, t + tol] em volta do acerto: a hierarquia desce só pelos nós que contêm o ponto (o custo é a profundidade
 * dela, não outra travessia inteira). A superfície de um volume não tem malha coincidente a procurar.
 */
fn refraction_coincident(o: vec3f, d: vec3f, hit: RayHit) -> RayHit {
    if (refraction_is_volume(hit.instance)) { return ray_miss(); }
    let tol = 1e-5 * (1.0 + hit.t);
    let start = max(hit.t - tol, 0.0);
    return ray_scene_hit_excluding(o + d * start, d, hit.t + tol - start, hit.instance);
}

/**
 * A interface no acerto `hit` (fechamento `c`) do raio de direção `d`, com a dielétrica coincidente `other` (fechamento
 * `c2`; `NONE` sem ela) cruzada junto, como a referência — os fechamentos já avaliados (spec 039: fora do traçado).
 */
fn refraction_crossing_at(d: vec3f, hit: RayHit, c: Closure, other: RayHit, c2: Closure, s: RefractionStack)
    -> RefractionCrossing {
    var out: RefractionCrossing;
    out.p = hit.position;
    out.nf = select(hit.normal, -hit.normal, dot(hit.normal, d) > 0.0);
    out.ns = refraction_shading_normal(c.normal, hit.normal, out.nf, d);
    out.first = refraction_cross_of(hit, c);
    out.count = 1u;
    var rough = c.transmission_roughness;
    if (other.instance != NONE && c2.transmission_weight > 0.0) {
        out.second = refraction_cross_of(other, c2);
        out.count = 2u;
        rough = max(rough, c2.transmission_roughness);
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
    /** O acerto é a superfície de um volume (a água das partículas): a normal dele para fora, para o lado seguinte. */
    vol: bool,
    vol_n: vec3f,
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
 * O lado, quanto aos volumes, do raio que parte do nó `n` na direção `dir`: depois da superfície de um volume, fora (0)
 * quando a direção aponta para fora dele, dentro (1) quando para dentro — a refração, a reflexão, a parede fina e a
 * passagem —; depois de uma malha, desconhecido (−1). O acerto seguinte não reacerta a superfície de partida.
 */
fn refraction_side_after(n: RefractionNode, dir: vec3f) -> i32 {
    if (!n.vol) { return -1; }
    return select(1, 0, dot(dir, n.vol_n) > 0.0);
}

/**
 * O nó do acerto `hit` do raio (o, d) com o fechamento `c` dele e o da dielétrica coincidente `c2` (`other`; `NONE` sem
 * ela) já avaliados — o que `refraction_advance` faz depois do traçado (spec 039: os fechamentos vêm da onda).
 */
fn refraction_node_at(o: vec3f, d: vec3f, hit: RayHit, c: Closure, other: RayHit, c2: Closure, stack: RefractionStack,
    channel: i32, interfaces: u32, state: ptr<function, u32>) -> RefractionNode {
    var n: RefractionNode;
    n.done = true;
    n.disperse = false;
    n.vol = false;
    n.moved = false;
    n.passes = false;
    n.radiance = vec3f(0.0);
    n.truncated = 0.0;
    n.albedo = vec3f(1.0);
    n.channel = channel;
    n.interfaces = interfaces;
    n.count = 0u;
    n.vol = refraction_is_volume(hit.instance);
    n.vol_n = hit.normal;
    n.through = refraction_absorb(vec3f(1.0), refraction_current(stack), min(hit.t, REFRACTION_FAR));
    if (hit.instance == NONE) {
        n.radiance = scene_environment(d);
        n.end = refraction_end(o + d * REFRACTION_FAR, NONE);
        return n;
    }
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
    let x = refraction_crossing_at(d, hit, c, other, c2, stack);
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
        n.ior_before = refraction_medium_ior(x.before);
        n.ior_next = refraction_medium_ior(x.next);
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
