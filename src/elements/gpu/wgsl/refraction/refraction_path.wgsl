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
// `max_interfaces` interfaces (ou de um meio além do teto da pilha) o caminho termina na estimativa da luz que chega ao
// ponto de todas as direções (`scene_ambient`: as sondas da luz global, o hemisfério) — a energia não some na reflexão
// interna total, ela segue presa na lâmina e sai por outro ponto, numa direção que o teto não deixa seguir; preto ali era
// a meia gota escura no vidro molhado visto de lado (T066d). A luminância dessa energia sai à parte (`truncated`). O fechamento com transmissão parcial é dielétrico com a probabilidade do peso dela,
// opaco no resto. A parede fina (`closure_thin_walled`) não muda a pilha: reflete com 2R/(1 + R) ou atravessa sem
// desviar. Com a normal do material, as interfaces refletem e refratam por ela (`refraction_shading_normal`); a
// geométrica decide o lado e a pilha. Sai também o ponto em que termina o caminho que mais contribui para a cor, com o registro do objeto, e o
// albedo da superfície nele (`closure_albedo`; 1 no céu e sem superfície).
// Determinística: o mesmo raio, o mesmo estado aleatório e a mesma cena dão a mesma amostra. Sai também se o caminho
// a parte da radiância que veio por caminhos que tocaram uma instância que se moveu desde o quadro anterior
// (`moving`: quem acumula o sinal encurta o histórico na proporção dela).
// Os acertos são os de `refraction_scene` (a malha ou a superfície de um volume, a água das partículas: T065e).
// Requer: NONE, refraction, refraction_interface, refraction_media, refraction_scene, ray_scene, ray_hit, camera_space,
// ray_direct, closure_eval, scene_environment, scene_indirect_lighting, scene_ambient, ray_media_transmittance,
// ray_volume_scatter, refraction_frame.

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
        s.media[s.count] = RefractionMedium(a.x, a.y, bitcast<f32>(a.z), bitcast<f32>(a.w), bitcast<f32>(b.x), b.y, b.z,
            b.w);
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
 * Luz que sai de um ponto opaco atingido para quem vê de `v` (rgb); no w, a luminância da luz que instâncias que se
 * moveram tapam nele (a luz do ponto muda sem que o ponto mude: a marca de movimento vale para ele, na medida dessa luz).
 */
fn refraction_shade(c: Closure, hit: RayHit, v: vec3f, seed: u32) -> vec4f {
    let n = select(hit.normal, -hit.normal, dot(hit.normal, v) < 0.0);
    let direct = ray_direct_marked(c, hit.position, n, v, refraction.light_count, seed);
    return vec4f(closure_emitted(c, n, v) + direct.xyz + scene_indirect_lighting(c, hit.position, n, v), direct.w);
}

/** Pontos do espalhamento simples por trecho do caminho no meio (orçamento fixo por trecho). */
const REFRACTION_SCATTER_STEPS: u32 = 4u;

/** A fase de Henyey–Greenstein (por esferorradiano) no cosseno `cos_theta` entre a luz que chega e a que segue. */
fn refraction_phase_hg(cos_theta: f32, g: f32) -> f32 {
    let g2 = g * g;
    let denom = max(1.0 + g2 - 2.0 * g * cos_theta, 1e-6);
    return (1.0 - g2) / (4.0 * PI * denom * sqrt(denom));
}

/**
 * A luz da fonte `i` que chega ao ponto `x` dentro do meio `m` (rgb), vinda pela direção `l`: a dela (`light_incoming`)
 * pela transmitância das contribuições da cena (`light_transmission`: a atmosfera, a água do campo dos fluidos) e pela
 * sombra; quando o meio é o de uma malha, pela superfície dela que o raio da luz cruza — o Fresnel exato na entrada da
 * luz e a extinção do meio até lá. Em linha reta, como a luz das fontes pela água do campo (`field_light_through`): o
 * desvio da luz na superfície (o foco) é o das cáusticas, que o corrigem nas superfícies, não no meio.
 */
fn refraction_light_in_medium(i: u32, x: vec3f, m: RefractionMedium, l: vec3f, dist: f32, radiance: vec3f) -> vec3f {
    var e = radiance * light_transmission(i, x);
    if (all(e <= vec3f(0.0))) { return vec3f(0.0); }
    var start = x;
    var left = min(dist, 1e6);
    if (m.instance != NONE && !refraction_is_volume(m.instance)) {
        let exit = ray_scene_hit(x, l, left);
        if (exit.instance == m.instance) {
            let cos_i = abs(dot(exit.normal, l));
            e *= (1.0 - refraction_fresnel(cos_i, 1.0, refraction_ior(m, -1)))
                * exp(-(refraction_medium_sigma(m) + refraction_medium_scatter(m)) * exit.t);
            start = exit.position + exit.normal * select(-1e-3, 1e-3, dot(exit.normal, l) > 0.0);
            left = max(left - exit.t, 0.0);
        }
    }
    if (ray_scene_trace(start, l, left, true, NONE).instance != NONE) { return vec3f(0.0); }
    return e;
}

/**
 * A luz das fontes espalhada uma vez para o caminho ao longo do trecho de `o` na direção `d`, de comprimento `t`, no
 * meio `m` (spec 034, T067e): a integral de σs e^(−σt s) · fase · luz no ponto, por `REFRACTION_SCATTER_STEPS` pontos
 * estratificados e sorteados pela extinção do canal que vai mais longe (a densidade e^(−σ s) no trecho; os outros canais
 * pesam pela razão, que só cai), uma fonte por ponto sorteada entre as usadas (o peso, a contagem). Sem espalhamento no
 * meio, nada. A luz do céu espalhada no meio não entra (só a das fontes).
 */
fn refraction_inscatter(m: RefractionMedium, o: vec3f, d: vec3f, t: f32, state: ptr<function, u32>) -> vec3f {
    let scatter = refraction_medium_scatter(m);
    let count = min(min(refraction.light_count, arrayLength(&lights)), LIGHT_LIMIT);
    if (all(scatter <= vec3f(0.0)) || count == 0u || t <= 0.0) { return vec3f(0.0); }
    let ext = refraction_medium_sigma(m) + scatter;
    // A densidade dos pontos: o canal de menor extinção entre os que espalham (o que vai mais longe no trecho).
    let far = vec3f(select(1e30, ext.x, scatter.x > 0.0), select(1e30, ext.y, scatter.y > 0.0),
        select(1e30, ext.z, scatter.z > 0.0));
    let sigma = min(far.x, min(far.y, far.z));
    let span = min(t, REFRACTION_FAR);
    let uniform = sigma * span < 1e-4;
    let mass = select((1.0 - exp(-sigma * span)) / max(sigma, 1e-30), span, uniform);
    var sum = vec3f(0.0);
    for (var k = 0u; k < REFRACTION_SCATTER_STEPS; k++) {
        let u = (f32(k) + refraction_random(state)) / f32(REFRACTION_SCATTER_STEPS);
        let s = select(-log(max(1.0 - u * (1.0 - exp(-sigma * span)), 1e-30)) / max(sigma, 1e-30), u * span, uniform);
        // σs e^(−σt s) / pdf(s), pdf = e^(−σ s) / mass.
        let w = scatter * exp(-(ext - vec3f(select(sigma, 0.0, uniform))) * s) * mass;
        let x = o + d * s;
        let i = min(u32(refraction_random(state) * f32(count)), count - 1u);
        let inc = light_incoming(lights[i], x);
        if (all(inc.radiance <= vec3f(0.0))) { continue; }
        let light = refraction_light_in_medium(i, x, m, inc.l, inc.dist, inc.radiance);
        sum += w * light * (refraction_phase_hg(dot(inc.l, d), refraction_medium_anisotropy(m)) * f32(count));
    }
    return sum / f32(REFRACTION_SCATTER_STEPS);
}

/**
 * A névoa no trecho de `o` na direção `d`, de comprimento `t`, de um caminho depois da primeira interface (T075; a do
 * trecho da câmera vem dos froxels na composição): no xyz a luz das fontes que ela espalha para o caminho — um ponto
 * sorteado no trecho (`ray_volume_scatter`: a transmitância até ele × σs × o comprimento), uma fonte sorteada, a luz até
 * o ponto pelo meio `m` —; no w, nada. A transmitância do trecho é `ray_media_transmittance`. O trecho que escapa vai até
 * `REFRACTION_FOG_REACH`: a névoa é local (as caixas e esferas dos volumes); o céu visto pela névoa ao longe é o dos
 * froxels no trecho da câmera.
 */
fn refraction_fog_inscatter(m: RefractionMedium, o: vec3f, d: vec3f, t: f32, state: ptr<function, u32>) -> vec3f {
    let count = min(min(refraction.light_count, arrayLength(&lights)), LIGHT_LIMIT);
    if (count == 0u || t <= 0.0) { return vec3f(0.0); }
    let s = ray_volume_scatter(o, d, t, refraction_random(state));
    if (all(s.weight <= vec3f(0.0))) { return vec3f(0.0); }
    let i = min(u32(refraction_random(state) * f32(count)), count - 1u);
    let inc = light_incoming(lights[i], s.position);
    if (all(inc.radiance <= vec3f(0.0))) { return vec3f(0.0); }
    let light = refraction_light_in_medium(i, s.position, m, inc.l, inc.dist, inc.radiance);
    return s.weight * light * (refraction_phase_hg(dot(inc.l, d), s.anisotropy) * f32(count));
}

/** Alcance do trecho que escapa para a névoa dos caminhos depois da primeira interface. */
const REFRACTION_FOG_REACH: f32 = 1.0e3;

/**
 * O brilho das luzes de disco (as direcionais com raio angular, `cones.z`: o sol) refletido por uma interface dielétrica
 * (a água, o vidro) para quem vê de `v`, no ponto `p` de normal de face `nf` (rgb; no w, a luminância do brilho tapado
 * por instâncias que se moveram): o lobo refletido da interface — o GGX na normal do fechamento `c` (a ondulação, o
 * relevo), a rugosidade somada à do disco (as larguras em quadratura), com o Fresnel exato do dielétrico como o do
 * caminho refletido (não o Schlick da camada do `closure_eval`, que fecha o forno da 011 pela tabela DFG) e o F82 do
 * condutor —, com sombra; a transmissão não entra (só a luz do lado de quem vê). A luz sem disco (uma direção, um ponto)
 * não tem reflexo visível na superfície lisa, como na referência; o caminho refletido nunca acerta a luz: este é o único
 * termo dela ali, sem contagem dupla.
 */
fn refraction_glint(c: Closure, p: vec3f, nf: vec3f, v: vec3f) -> vec4f {
    let n = select(nf, -nf, dot(nf, v) < 0.0);
    let nb = closure_lobe_normal(c.normal, n, v);
    let nv = max(dot(nb, v), 1e-4);
    let count = min(min(refraction.light_count, arrayLength(&lights)), LIGHT_LIMIT);
    let r = max(c.specular_roughness, BSDF_MIN_ROUGHNESS);
    let f0d = vec3f(bsdf_f0_from_ior(c.dielectric_ior));
    let ws = max(c.dielectric_weight + c.conductor_weight, 1e-6);
    let f0 = (c.dielectric_weight * f0d * c.dielectric_tint + c.conductor_weight * c.conductor_f0) / ws;
    var sum = vec4f(0.0);
    for (var i = 0u; i < count; i++) {
        let light = lights[i];
        let disc = light.cones.z;
        if (light.kind != 0u || disc <= 0.0) { continue; }
        let inc = light_incoming(light, p);
        let nl = dot(nb, inc.l);
        if (nl <= 0.0 || dot(n, inc.l) <= 0.0 || all(inc.radiance <= vec3f(0.0))) { continue; }
        let h = normalize(v + inc.l);
        let vh = max(dot(v, h), 0.0);
        let a2 = r * r * r * r + disc * disc;
        let f = c.dielectric_weight * c.dielectric_tint * bsdf_f_dielectric(vh, c.dielectric_ior)
            + c.conductor_weight * bsdf_f82(c.conductor_f0, c.conductor_tint, vh);
        let dfg = closure_dfg(nv, sqrt(sqrt(a2)));
        let response = f * bsdf_d_ggx(max(dot(nb, h), 0.0), a2) * bsdf_v_smith_correlated(nv, nl, a2) * nl
            * bsdf_multiscatter(f0, dfg.x + dfg.y) * inc.radiance * light_transmission(i, p);
        let blocker = ray_scene_trace(p + n * 1e-3, inc.l, min(inc.dist, 1e6), true, NONE).instance;
        if (blocker != NONE) {
            let moved = ray_instance_moved_at(ray_scene_info.instanceFirst + blocker * RAY_INSTANCE_WORDS);
            sum.w += select(0.0, luminance(response), moved);
            continue;
        }
        sum += vec4f(response, 0.0);
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

/**
 * A largura (m) que o pixel do caminho cobre no acerto que se resolve agora (a gota menor que ela entra pela média no
 * pixel, `scene_wetness_slope`): quem segue um caminho de câmera a escreve antes de resolver o acerto; 0 (no ponto) para
 * os outros.
 */
var<private> refraction_wet_footprint: f32 = 0.0;

/**
 * O que se vê pela água da interface resolvida agora muda de um quadro para o outro (`scene_wetness_moving`: a cabeça
 * do filete que desce, `refraction_wet_normal`) — conta como movido (`refraction_node_at`), e a reconstrução da meia
 * resolução não guarda ali o valor exato antigo. A gota parada e a faixa do filete não: guardadas, saem na resolução
 * cheia.
 */
var<private> refraction_wet_moved: bool = false;

/**
 * A curvatura (1/m) da água na interface resolvida agora (`scene_wetness_slope`: a calota da gota, o filete; 0 sem
 * água ou na película plana): a gota é uma lente — quem segue o caminho abre o cone do raio por ela
 * (`refraction_chain_follow_one`), e o que se vê pela gota é filtrado na largura que o cone tem lá.
 */
var<private> refraction_wet_curvature: f32 = 0.0;

/**
 * A direção com que o raio volta ao sólido quando sai dele por uma gota e a calota o reflete inteiro (a reflexão interna
 * total na água, `refraction_wet_normal`); nula sem ela. Com ela, a interface do acerto reflete inteira nessa direção.
 */
var<private> refraction_wet_back: vec3f = vec3f(0.0);

/**
 * A volta da gota ao sólido (`refraction_wet_back`) também reflete inteira na face dele (o índice do sólido menor que o
 * da água; na parede fina, a volta direto ao meio de fora): a lâmina guia o raio para longe da gota (T075).
 */
var<private> refraction_wet_trapped: bool = false;

/**
 * A normal de sombreamento `ns` com a água do sólido (spec 034, T066d; ponto `scene_wetness_slope`) para o raio `d`: a
 * superfície da água (a película ou a calota da gota) tem a normal n − ∇h, e o raio passa por duas interfaces — o ar e a
 * água por ela, a água e o sólido de índice `ior` pela face plana. Devolve a normal da interface única do ar com o sólido
 * que dá a mesma direção (Snell na forma vetorial: η₁ d − η₂ t é paralelo à normal): a gota é uma lente — o fundo
 * refratado dentro dela, a borda escura onde o raio sai rasante ou volta (a reflexão interna total na saída pela água
 * vira a do sólido pela normal da água). Na película plana (∇h = 0), nada muda: a água fina e uniforme sobre o vidro liso
 * é quase invisível também na realidade.
 */
fn refraction_wet_normal(ns: vec3f, hit: RayHit, ior: f32, d: vec3f) -> vec3f {
    // Só nos sólidos: a superfície de um volume (a própria água) não tem película.
    if (refraction_is_volume(hit.instance)) { return ns; }
    let wet = scene_wetness_slope(hit.position, hit.normal, refraction_wet_footprint);
    let slope = wet.xyz;
    refraction_wet_curvature = max(refraction_wet_curvature, wet.w);
    if (dot(slope, slope) <= 0.0) { return ns; }
    refraction_wet_moved = refraction_wet_moved || scene_wetness_moving(hit.position, hit.normal,
        refraction_wet_footprint);
    let n = hit.normal;
    let side = select(-1.0, 1.0, dot(ns, n) >= 0.0);
    // A água fica do lado de `n` (a película é a da face).
    let nw = normalize(n - slope);
    let water = 1.333;
    if (dot(d, n) < 0.0) {
        // De fora: ar → água → sólido.
        let t1 = refract(d, nw, 1.0 / water);
        let t2 = refract(t1, n, water / ior);
        if (dot(t2, t2) <= 0.0) { return side * nw; }
        return side * normalize(d - ior * t2);
    }
    // De dentro: sólido → água → ar.
    let t1 = refract(d, -n, ior / water);
    if (dot(t1, t1) <= 0.0) { return ns; }
    let t2 = refract(t1, -nw, water);
    if (dot(t2, t2) > 0.0) { return side * normalize(ior * d - t2); }
    // A reflexão interna total na calota: o raio volta para dentro da gota. As voltas seguintes acertam a calota do
    // outro lado (ela é simétrica: a inclinação oposta); a que sai pela calota é a transmissão (a normal equivalente
    // dela), a que desce para a base volta ao sólido com a direção exata (`refraction_wet_back`: a interface reflete
    // inteira por ela). Preto aqui era a meia gota escura no vidro molhado visto de lado: o reflexo pela normal da água
    // saía pela face plana com a pilha ainda no sólido, e o caminho se perdia até o teto de interfaces.
    var r = reflect(t1, nw);
    for (var k = 0u; k < REFRACTION_WET_BOUNCES; k++) {
        if (dot(r, n) < 0.0) { break; }
        let nk = normalize(n + select(slope, -slope, (k & 1u) != 0u));
        let out = refract(r, -nk, water);
        if (dot(out, out) > 0.0) { return side * normalize(ior * d - out); }
        r = reflect(r, nk);
    }
    // Ainda subindo depois das voltas (rasante na borda): desce pela base (o espelho na face plana).
    if (dot(r, n) >= 0.0) { r = r - 2.0 * dot(r, n) * n; }
    refraction_wet_back = refract(r, n, water / ior);
    refraction_wet_trapped = dot(refraction_wet_back, refraction_wet_back) <= 0.0;
    return ns;
}

/** Teto das voltas do raio dentro da gota na reflexão interna total (`refraction_wet_normal`). */
const REFRACTION_WET_BOUNCES: u32 = 4u;

fn refraction_thin(c: Closure, hit: RayHit, d: vec3f, outside: RefractionMedium) -> RefractionThin {
    let nf = select(hit.normal, -hit.normal, dot(hit.normal, d) > 0.0);
    // A água sobre a parede fina: as faces paralelas não desviam o raio, e ele passa à água (e volta dela) direto do
    // meio de fora — o índice da gota contra o de fora, não o do vidro (T075).
    let ns = refraction_wet_normal(refraction_shading_normal(c.normal, hit.normal, nf, d), hit,
        refraction_medium_ior(outside).y, d);
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
    out.ns = refraction_wet_normal(refraction_shading_normal(c.normal, hit.normal, out.nf, d), hit, c.dielectric_ior, d);
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
 * superfície nesse ponto (1 no céu e sem superfície) — e a luz que mudou com instâncias que se moveram (`moving`): a
 * radiância dos caminhos que tocaram uma delas e a luz que a sombra delas tapa.
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
 * limite de interfaces, com a radiância de `scene_ambient`; sem a absorção), uma borda que não muda o meio (`passes`: o raio segue reto depois dos
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
    /** A luminância da luz que instâncias que se moveram tapam no ponto opaco (`ray_direct_marked`). */
    blocked: f32,
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
    channel: i32, interfaces: u32, state: ptr<function, u32>, shade: vec4f) -> RefractionNode {
    var n: RefractionNode;
    n.done = true;
    n.disperse = false;
    n.vol = false;
    n.moved = false;
    n.blocked = 0.0;
    n.passes = false;
    n.radiance = vec3f(0.0);
    n.truncated = 0.0;
    n.albedo = vec3f(1.0);
    n.channel = channel;
    n.interfaces = interfaces;
    n.count = 0u;
    n.vol = refraction_is_volume(hit.instance);
    n.vol_n = hit.normal;
    refraction_wet_moved = false;
    refraction_wet_curvature = 0.0;
    refraction_wet_back = vec3f(0.0);
    refraction_wet_trapped = false;
    n.through = refraction_absorb(vec3f(1.0), refraction_current(stack), min(hit.t, REFRACTION_FAR));
    if (hit.instance == NONE) {
        n.radiance = scene_environment(d);
        n.end = refraction_end(o + d * REFRACTION_FAR, NONE);
        return n;
    }
    n.end = refraction_end(hit.position, hit.renderable);
    n.moved = refraction_hit_moved(hit);
    if (!refraction_takes_interface(c, state)) {
        // A luz do ponto opaco, da passada da onda (`refraction_chain_light_main`, spec 034 T078: o mesmo sorteio).
        n.radiance = shade.xyz;
        n.moved = n.moved || shade.w > 0.0;
        n.blocked = shade.w;
        n.albedo = closure_albedo(c);
        return n;
    }
    n.interfaces += 1u;
    if (n.interfaces > refraction.max_interfaces || stack.overflow != 0u) {
        n.truncated = 1.0;
        n.radiance = scene_ambient(hit.position);
        return n;
    }
    n.done = false;
    if (c.transmission_thin > 0.0) {
        // Parede fina: a pilha não muda; reflete pela refletância (a roleta pela do canal seguido, ou pela do verde) ou
        // atravessa sem desviar.
        let thin = refraction_thin(c, hit, d, refraction_current(stack));
        n.moved = n.moved || refraction_wet_moved;
        n.p = hit.position;
        n.nf = thin.nf;
        if (refraction_wet_trapped) {
            // A gota refletiu o raio inteiro de volta e a face o reflete também: a lâmina o guia para longe da gota, e
            // o caminho termina na luz de todas as direções, como no teto de interfaces (T075).
            n.done = true;
            n.truncated = 1.0;
            n.radiance = scene_ambient(hit.position);
            return n;
        }
        if (dot(refraction_wet_back, refraction_wet_back) > 0.0) {
            // A gota refletiu o raio inteiro de volta (a reflexão interna total na calota, como no sólido, T075): na
            // parede fina ele sai do lado de onde veio, na direção da refração da água para o meio de fora (`wetBackExit`).
            n.p_reflect = 1.0;
            n.reflect_dir = refraction_wet_back;
            n.reflect_weight = vec3f(1.0);
            n.transmit_dir = refraction_wet_back;
            n.transmit_weight = vec3f(0.0);
            return n;
        }
        let f = thin.reflect_weight;
        n.p_reflect = clamp(select(f.y, f[max(n.channel, 0)], n.channel >= 0), 1e-4, 1.0 - 1e-4);
        n.reflect_dir = thin.reflect_dir;
        n.reflect_weight = f;
        n.transmit_dir = d;
        n.transmit_weight = thin.transmit_weight;
        return n;
    }
    let x = refraction_crossing_at(d, hit, c, other, c2, stack);
    n.moved = n.moved || refraction_wet_moved;
    n.p = x.p;
    n.nf = x.nf;
    n.first = x.first;
    n.second = x.second;
    n.count = x.count;
    if (!x.crosses) {
        n.passes = true;
        return n;
    }
    if (refraction_wet_trapped) {
        // A volta da gota reflete inteira também na face do sólido: a lâmina guia o raio para longe (T075).
        n.done = true;
        n.truncated = 1.0;
        n.radiance = scene_ambient(hit.position);
        return n;
    }
    if (dot(refraction_wet_back, refraction_wet_back) > 0.0) {
        // A gota refletiu o raio inteiro de volta ao sólido: um lobo só, sem roleta nem dispersão.
        n.p_reflect = 1.0;
        n.reflect_dir = refraction_wet_back;
        n.reflect_weight = vec3f(1.0);
        n.transmit_dir = refraction_wet_back;
        n.transmit_weight = vec3f(0.0);
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
