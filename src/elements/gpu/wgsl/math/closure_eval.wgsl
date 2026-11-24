// Avaliação do fechamento (spec 011, R3/R5): a resposta a uma luz de direção `l` (`closure_eval`) e ao hemisfério
// céu/chão (`closure_ambient`). Camadas por escala de albedo, de cima para baixo: sheen → verniz → especular de base →
// difuso, subsuperfície e parede fina (sob o especular dielétrico). O multiespalhamento do GGX é compensado pela tabela
// DFG (`pbr_dfg`: E = F0·A + B e o albedo do sheen), e as perdas de cada camada são exatamente o que ela reflete — o
// teste de forno fecha em 1.
//
// Especialização: `CLOSURE_LOBES` (constante `override`, bits `CLOSURE_*`) é a máscara dos lobos que o material usa;
// o pipeline a fixa na criação e os ramos dos lobos ausentes saem do código compilado. Sem especializar, todos.
// Requer: closure, bsdf, basis, random; recursos `pbr_dfg` e `pbr_sampler` (a tabela do `PbrTables`).

override CLOSURE_LOBES: u32 = 4095u;

// O reflexo traçado (spec 011, T114): 1 no pipeline cujos lobos especulares lisos recebem a radiância de um raio
// refletido por pixel (o desenho dos opacos com o reflexo traçado da cena) — ali `closure_indirect` deixa de fora a
// parte lisa da radiância especular indireta, que entra pela composição do traçado. 0 (os acertos dos raios, as sondas,
// o desenho sem o traçado): a luz indireta inteira.
override CLOSURE_TRACED: u32 = 0u;

// Rugosidade até a qual o lobo especular é um espelho para o reflexo traçado (um raio na direção refletida) e a partir
// da qual ele fica só com a luz indireta da cena (as sondas, o hemisfério); entre as duas, a mistura.
const CLOSURE_MIRROR_SMOOTH: f32 = 0.08;
const CLOSURE_MIRROR_ROUGH: f32 = 0.16;

// Fração da radiância especular de um lobo de rugosidade `roughness` que vem do raio refletido (1 liso, 0 áspero).
fn closure_mirror(roughness: f32) -> f32 {
    return 1.0 - smoothstep(CLOSURE_MIRROR_SMOOTH, CLOSURE_MIRROR_ROUGH, roughness);
}

// A fração que este pipeline deixa para o reflexo traçado (0 sem ele).
fn closure_traced(mirror: f32) -> f32 {
    return select(0.0, mirror, CLOSURE_TRACED != 0u);
}

// O material usa o lobo `bit`? (constante na especialização.)
fn closure_has(bit: u32) -> bool {
    return (CLOSURE_LOBES & bit) != 0u;
}

// A fração de espelho do especular de base: a da rugosidade do eixo largo do lobo. No lobo anisotrópico (o metal
// escovado) o eixo largo tem α · (1 + |anisotropia|) — a rugosidade vezes √(1 + |anisotropia|): um raio só por pixel
// não o representa (sorteado, vira ruído; na direção dominante, vira um espelho que o lobo não é), e ele fica com a
// radiância das sondas, já filtrada, e com o realce analítico das luzes. No isotrópico, a rugosidade.
fn closure_base_mirror(c: Closure) -> f32 {
    var r = c.specular_roughness;
    if (closure_has(CLOSURE_ANISOTROPY)) { r *= sqrt(1.0 + clamp(abs(c.specular_anisotropy), 0.0, 1.0)); }
    return closure_mirror(r);
}

// Tabela DFG em (μ = n·v, rugosidade): (A, B, albedo do sheen).
fn closure_dfg(n_dot_v: f32, roughness: f32) -> vec3f {
    let uv = vec2f(clamp(n_dot_v, 0.0, 1.0), clamp(roughness, 0.0, 1.0));
    let size = vec2f(textureDimensions(pbr_dfg, 0));
    let st = (uv * (size - 1.0) + 0.5) / size;
    return textureSampleLevel(pbr_dfg, pbr_sampler, st, 0.0).xyz;
}

// Normal de um lobo: a própria (se definida) ou a geométrica `n`, voltada para o observador.
fn closure_lobe_normal(own: vec3f, n: vec3f, v: vec3f) -> vec3f {
    let m = select(n, normalize(own), dot(own, own) > 1e-12);
    return select(m, normalize(m - v * (dot(m, v) - 1e-3)), dot(m, v) <= 0.0);
}

// Referencial tangente estável a partir da normal (Duff et al. 2017) — a tangente padrão sem ligação.
fn closure_default_tangent(n: vec3f) -> vec3f {
    return basis_duff(n)[0];
}

// F90 do dielétrico: 1 nas interfaces reais, indo a 0 com o F0 (IOR → 1 não reflete nada, nem rasante).
fn closure_dielectric_f90(f0: f32) -> f32 {
    return clamp(50.0 * f0, 0.0, 1.0);
}

// Refletância do especular de base na direção `cos_t` (sem a distribuição): dielétrico + condutor, com o filme fino.
fn closure_base_fresnel(c: Closure, cos_t: f32) -> vec3f {
    let f0d = vec3f(bsdf_f0_from_ior(c.dielectric_ior));
    var f = c.dielectric_weight * c.dielectric_tint * bsdf_f_schlick(f0d, vec3f(closure_dielectric_f90(f0d.x)), cos_t)
        + c.conductor_weight * bsdf_f82(c.conductor_f0, c.conductor_tint, cos_t);
    if (closure_has(CLOSURE_THIN_FILM) && c.film_weight > 0.0) {
        let ws = c.dielectric_weight + c.conductor_weight;
        let f0 = (c.dielectric_weight * f0d + c.conductor_weight * c.conductor_f0) / max(ws, 1e-6);
        let tint = c.dielectric_weight * c.dielectric_tint + c.conductor_weight;
        let film = tint * bsdf_thin_film(cos_t, c.film_thickness, c.film_ior, f0);
        f = mix(f, film, clamp(c.film_weight, 0.0, 1.0));
    }
    return f;
}

// Albedo direcional (energia refletida) do especular de base, com o multiespalhamento compensado: vec3 por canal.
fn closure_base_albedo(c: Closure, n_dot_v: f32) -> vec3f {
    let dfg = closure_dfg(n_dot_v, c.specular_roughness);
    let e_ss = dfg.x + dfg.y;
    let f0d = vec3f(bsdf_f0_from_ior(c.dielectric_ior));
    let ed = c.dielectric_tint * (f0d * dfg.x + closure_dielectric_f90(f0d.x) * dfg.y);
    let ec = c.conductor_f0 * dfg.x + dfg.y;
    let film_mix = select(0.0, clamp(c.film_weight, 0.0, 1.0), closure_has(CLOSURE_THIN_FILM));
    let film = bsdf_thin_film(n_dot_v, c.film_thickness, c.film_ior, mix(f0d, c.conductor_f0, c.conductor_weight / max(c.dielectric_weight + c.conductor_weight, 1e-6))) * e_ss;
    let d = mix(ed * bsdf_multiscatter(f0d * c.dielectric_tint, e_ss), film, film_mix);
    let m = mix(ec * bsdf_multiscatter(c.conductor_f0, e_ss), film, film_mix);
    return c.dielectric_weight * d + c.conductor_weight * m;
}

// Albedo direcional do especular dielétrico sozinho (o que ele tira dos lobos de baixo), compensado, com peso 1.
fn closure_dielectric_albedo(c: Closure, n_dot_v: f32) -> vec3f {
    let dfg = closure_dfg(n_dot_v, c.specular_roughness);
    let f0d = vec3f(bsdf_f0_from_ior(c.dielectric_ior));
    return c.dielectric_tint * (f0d * dfg.x + closure_dielectric_f90(f0d.x) * dfg.y)
        * bsdf_multiscatter(f0d * c.dielectric_tint, dfg.x + dfg.y);
}

// Fração dos lobos de baixo (difuso, subsuperfície, parede fina, transmissão) que passa pelo especular dielétrico: o
// dielétrico cobre a parte não condutora da base (a mistura com metal já reduziu os pesos de baixo).
fn closure_under_dielectric(c: Closure, n_dot_v: f32) -> vec3f {
    if (!closure_has(CLOSURE_SPECULAR) || c.dielectric_weight <= 0.0) { return vec3f(1.0); }
    let cover = clamp(c.dielectric_weight / max(1.0 - min(c.conductor_weight, 1.0), 1e-4), 0.0, 1.0);
    return vec3f(1.0) - cover * closure_dielectric_albedo(c, n_dot_v);
}

// Albedo do verniz (dielétrico liso de cima), compensado.
fn closure_coat_albedo(c: Closure, n_dot_v: f32) -> f32 {
    let dfg = closure_dfg(n_dot_v, c.coat_roughness);
    let f0 = bsdf_f0_from_ior(c.coat_ior);
    return (f0 * dfg.x + closure_dielectric_f90(f0) * dfg.y) * bsdf_multiscatter(vec3f(f0), dfg.x + dfg.y).x;
}

// O que atravessa o verniz até a base (ida): a perda pela reflexão e a cor de absorção.
fn closure_coat_pass(c: Closure, n_dot_v: f32) -> vec3f {
    if (!closure_has(CLOSURE_COAT) || c.coat_weight <= 0.0) { return vec3f(1.0); }
    let w = clamp(c.coat_weight, 0.0, 1.0);
    return (1.0 - w * closure_coat_albedo(c, n_dot_v)) * mix(vec3f(1.0), c.coat_color, w);
}

// O que atravessa o sheen até as camadas de baixo.
fn closure_sheen_pass(c: Closure, n_dot_v: f32) -> f32 {
    if (!closure_has(CLOSURE_SHEEN) || c.sheen_weight <= 0.0) { return 1.0; }
    let e = closure_dfg(n_dot_v, c.sheen_roughness).z;
    return 1.0 - clamp(c.sheen_weight, 0.0, 1.0) * max(c.sheen_color.r, max(c.sheen_color.g, c.sheen_color.b)) * e;
}

// Alarga as rugosidades do especular e do verniz pela variância da normal na tela (controle de serrilhado especular,
// Tokuyoshi-Kaplanyan); `variance` de `bsdf_normal_variance`, medida no início do fragment.
fn closure_specular_aa(c: Closure, variance: f32) -> Closure {
    var o = c;
    o.specular_roughness = sqrt(sqrt(bsdf_specular_aa(bsdf_alpha2(c.specular_roughness), variance)));
    o.coat_roughness = sqrt(sqrt(bsdf_specular_aa(bsdf_alpha2(c.coat_roughness), variance)));
    return o;
}

// Número de flocos alinhados entre `count` flocos, cada um alinhado com a probabilidade `p`, para o sorteio `u` em
// [0, 1): a binomial — pela Poisson de média `count · p` (a inversa da acumulada, até 24 termos) enquanto a média é
// menor que 8, e pela normal de mesma média e variância acima disso (a inversa da normal de Abramowitz e Stegun
// 26.2.23, erro abaixo de 4,5e-4), presa em [0, `count`].
fn closure_glint_count(count: f32, p: f32, u: f32) -> f32 {
    let mean = count * p;
    if (mean >= 8.0) {
        let q = clamp(min(u, 1.0 - u), 1e-7, 0.5);
        let t = sqrt(-2.0 * log(q));
        let z = (t - (2.515517 + t * (0.802853 + t * 0.010328)) / (1.0 + t * (1.432788 + t * (0.189269 + t * 0.001308))))
            * select(-1.0, 1.0, u > 0.5);
        return clamp(round(mean + sqrt(mean * (1.0 - p)) * z), 0.0, count);
    }
    var term = exp(-mean);
    var cdf = term;
    var k = 0.0;
    for (var i = 1; i <= 24; i++) {
        if (u < cdf) { break; }
        k = f32(i);
        term *= mean / k;
        cdf += term;
    }
    return min(k, count);
}

// Brilhos pontuais (spec 011, T118): a distribuição das micronormais vista por um pixel que cobre poucos flocos — a
// contagem discreta dos flocos alinhados com o vetor do meio `h`, em vez da densidade média `d` = D(h) (Jakob et al.
// 2014, "Discrete Stochastic Microfacet Models"; a contagem por célula de um nível de detalhe e a mistura de dois
// níveis de Zirr e Kaplanyan 2016, "Real-time Rendering of Procedural Multiscale Materials"). Cada floco é um espelho
// pequeno de lobo próprio (ângulo sólido Ω = π · α_f², α_f = `glint_roughness`²) e orientação sorteada da
// distribuição do lobo: está alinhado com a probabilidade p = D(h) · (n·h) · Ω. Dos N flocos da célula do pixel
// (`glint_count`; 4 N no nível seguinte), k estão alinhados — k sorteado da binomial com um valor fixo da célula e da
// caixa de `h` (de lado √Ω no plano das inclinações: outra direção, outros flocos) —, e a densidade é k / (N · (n·h) ·
// Ω): a média é D(h) (a energia do lobo), e longe do realce, onde p é pequeno, sobram poucos pontos fortes. Com muitos
// flocos por pixel a contagem vai à média e o lobo fica liso. Devolve a densidade no lugar de `d`.
fn closure_glint(c: Closure, nb: vec3f, h: vec3f, d: f32) -> f32 {
    let nh = dot(nb, h);
    if (c.glint_count <= 0.0 || nh <= 1e-3) { return d; }
    let af = c.glint_roughness * c.glint_roughness;
    let omega = PI * af * af;
    let frame = basis_duff(nb);
    let side = sqrt(omega);
    let box = vec2i(floor(vec2f(dot(frame[0], h), dot(frame[1], h)) / (nh * side)));
    let salt = (bitcast<u32>(box.x) * 0x9e3779b1u) ^ (bitcast<u32>(box.y) * 0x85ebca77u);
    var density = vec2f(0.0);
    for (var level = 0u; level < 2u; level++) {
        let count = c.glint_count * select(1.0, 4.0, level == 1u);
        let p = min(d * nh * omega, 1.0);
        let cell = u32(c.glint_cells[level] * 16777215.0);
        let k = closure_glint_count(count, p, random_unit(pcg_hash(cell ^ pcg_hash(salt + level))));
        density[level] = k / (count * nh * omega);
    }
    return mix(density.x, density.y, c.glint_cells.z);
}

// O referencial e os α do lobo especular de base: a tangente (xyz de [0]), a bitangente ([1]) e os α ao longo de cada
// uma ([2].xy); [2].z é 1 no lobo anisotrópico. A tangente é a direção das ranhuras (metal escovado, fio da seda):
// anisotropia positiva alisa ao longo dela e aspera através dela — o realce se alonga perpendicular à tangente.
fn closure_base_frame(c: Closure, nb: vec3f) -> mat3x3f {
    let r = max(c.specular_roughness, BSDF_MIN_ROUGHNESS);
    let alpha = r * r;
    if (closure_has(CLOSURE_ANISOTROPY) && abs(c.specular_anisotropy) > 1e-3) {
        let t0 = select(closure_default_tangent(nb), c.tangent, dot(c.tangent, c.tangent) > 1e-12);
        let t = normalize(t0 - nb * dot(nb, t0));
        return mat3x3f(t, cross(nb, t), vec3f(max(alpha * (1.0 - c.specular_anisotropy), 1e-3),
            max(alpha * (1.0 + c.specular_anisotropy), 1e-3), 1.0));
    }
    return mat3x3f(vec3f(0.0), vec3f(0.0), vec3f(alpha, alpha, 0.0));
}

// O lobo especular de base para a luz de direção `l`, no referencial `frame` (`closure_base_frame`): F · D · V ·
// (n·l), sem a compensação do multiespalhamento (`closure_base_boost`). `nb` é a normal do lobo.
fn closure_base_lobe_in(c: Closure, frame: mat3x3f, nb: vec3f, v: vec3f, l: vec3f) -> vec3f {
    let nl = max(dot(nb, l), 0.0);
    if (nl <= 0.0) { return vec3f(0.0); }
    let nv = max(dot(nb, v), 1e-4);
    let h = normalize(v + l);
    let nh = max(dot(nb, h), 0.0);
    let vh = max(dot(v, h), 0.0);
    var dv: f32;
    if (frame[2].z > 0.0) {
        let t = frame[0];
        let b = frame[1];
        let at = frame[2].x;
        let ab = frame[2].y;
        dv = bsdf_d_ggx_aniso(dot(t, h), dot(b, h), nh, at, ab)
            * bsdf_v_smith_correlated_aniso(at, ab, dot(t, v), dot(b, v), dot(t, l), dot(b, l), nv, nl);
    } else {
        let a2 = frame[2].x * frame[2].x;
        var d = bsdf_d_ggx(nh, a2);
        if (closure_has(CLOSURE_GLINT)) { d = closure_glint(c, nb, h, d); }
        dv = d * bsdf_v_smith_correlated(nv, nl, a2);
    }
    return closure_base_fresnel(c, vh) * dv * nl;
}

// O lobo especular de base para a luz de direção `l`: F · D · V · (n·l), sem a compensação do multiespalhamento.
fn closure_base_lobe(c: Closure, nb: vec3f, v: vec3f, l: vec3f) -> vec3f {
    if (!closure_has(CLOSURE_SPECULAR) || dot(nb, l) <= 0.0 || c.dielectric_weight + c.conductor_weight <= 0.0) {
        return vec3f(0.0);
    }
    return closure_base_lobe_in(c, closure_base_frame(c, nb), nb, v, l);
}

// A compensação do multiespalhamento do especular de base (por canal), para o cosseno `nv` com quem vê.
fn closure_base_boost(c: Closure, nv: f32) -> vec3f {
    let dfg = closure_dfg(nv, c.specular_roughness);
    let f0d = vec3f(bsdf_f0_from_ior(c.dielectric_ior));
    let ws = max(c.dielectric_weight + c.conductor_weight, 1e-6);
    let f0 = (c.dielectric_weight * f0d * c.dielectric_tint + c.conductor_weight * c.conductor_f0) / ws;
    return bsdf_multiscatter(f0, dfg.x + dfg.y);
}

// Os lobos de baixo do dielétrico para a luz de direção `l`: o difuso, a subsuperfície (o perfil de difusão integrado
// — a luz que entra no ponto e sai em volta dele, somada: o difuso de albedo `subsurface_color`; a difusão entre
// pixels e a luz que atravessa são do passe de subsuperfície do desenho) e a parede fina (a luz de trás).
fn closure_under_lobes(c: Closure, nb: vec3f, v: vec3f, l: vec3f) -> vec3f {
    let nv = max(dot(nb, v), 1e-4);
    let nl_raw = dot(nb, l);
    let nl = max(nl_raw, 0.0);
    var under = vec3f(0.0);
    if (closure_has(CLOSURE_DIFFUSE) && c.diffuse_weight > 0.0 && nl > 0.0) {
        under += c.diffuse_weight * bsdf_oren_nayar_energy(c.diffuse_color, c.diffuse_roughness, nl, nv, dot(l, v));
    }
    if (closure_has(CLOSURE_SUBSURFACE) && c.subsurface_weight > 0.0 && nl > 0.0) {
        under += c.subsurface_weight * c.subsurface_color * (nl / PI);
    }
    if (closure_has(CLOSURE_TRANSLUCENT) && c.translucent_weight > 0.0) {
        under += c.translucent_weight * c.translucent_color / PI * max(-nl_raw, 0.0);
    }
    return under;
}

// O lobo do verniz para a luz de direção `l`: peso · F · D · V · (n·l), sem a compensação do multiespalhamento
// (`closure_coat_boost`). `nc` é a normal do verniz.
fn closure_coat_lobe(c: Closure, nc: vec3f, v: vec3f, l: vec3f) -> f32 {
    let ncl = max(dot(nc, l), 0.0);
    if (!closure_has(CLOSURE_COAT) || c.coat_weight <= 0.0 || ncl <= 0.0) { return 0.0; }
    let ncv = max(dot(nc, v), 1e-4);
    let h = normalize(v + l);
    let r = max(c.coat_roughness, BSDF_MIN_ROUGHNESS);
    let a2 = r * r * r * r;
    let f0 = bsdf_f0_from_ior(c.coat_ior);
    let f = bsdf_f_schlick(vec3f(f0), vec3f(closure_dielectric_f90(f0)), max(dot(v, h), 0.0)).x;
    return clamp(c.coat_weight, 0.0, 1.0) * f * bsdf_d_ggx(max(dot(nc, h), 0.0), a2)
        * bsdf_v_smith_correlated(ncv, ncl, a2) * ncl;
}

// A compensação do multiespalhamento do verniz, para o cosseno `ncv` com quem vê.
fn closure_coat_boost(c: Closure, ncv: f32) -> f32 {
    let dfg = closure_dfg(ncv, c.coat_roughness);
    return bsdf_multiscatter(vec3f(bsdf_f0_from_ior(c.coat_ior)), dfg.x + dfg.y).x;
}

// O lobo do sheen para a luz de direção `l`.
fn closure_sheen_lobe(c: Closure, nb: vec3f, v: vec3f, l: vec3f) -> vec3f {
    let nl = max(dot(nb, l), 0.0);
    if (!closure_has(CLOSURE_SHEEN) || c.sheen_weight <= 0.0 || nl <= 0.0) { return vec3f(0.0); }
    let nv = max(dot(nb, v), 1e-4);
    let nh = max(dot(nb, normalize(v + l)), 0.0);
    return clamp(c.sheen_weight, 0.0, 1.0) * c.sheen_color * bsdf_d_charlie(nh, c.sheen_roughness)
        * bsdf_v_neubelt(nv, nl) * nl;
}

// Resposta do fechamento a uma luz de direção `l` (unitária, da superfície para a luz) e radiância `radiance` que chega
// (irradiância na normal da luz): radiância refletida para `v`. `n` é a normal geométrica de sombreamento.
fn closure_eval(c: Closure, n: vec3f, v: vec3f, l: vec3f, radiance: vec3f) -> vec3f {
    let nb = closure_lobe_normal(c.normal, n, v);
    let nv = max(dot(nb, v), 1e-4);

    // Especular de base.
    var spec = closure_base_lobe(c, nb, v, l);
    if (any(spec > vec3f(0.0))) { spec *= closure_base_boost(c, nv); }
    let base = spec + closure_under_dielectric(c, nv) * closure_under_lobes(c, nb, v, l);

    // Verniz.
    var coat = vec3f(0.0);
    if (closure_has(CLOSURE_COAT) && c.coat_weight > 0.0) {
        let nc = closure_lobe_normal(c.coat_normal, n, v);
        let lobe = closure_coat_lobe(c, nc, v, l);
        if (lobe > 0.0) { coat = vec3f(lobe * closure_coat_boost(c, max(dot(nc, v), 1e-4))); }
    }

    let below_coat = closure_coat_pass(c, nv) * base;
    return (closure_sheen_lobe(c, nb, v, l) + closure_sheen_pass(c, nv) * (coat + below_coat)) * radiance;
}

// Radiância do hemisfério céu/chão na direção `d` (`up` unitário).
fn closure_hemisphere(d: vec3f, sky: vec3f, ground: vec3f, up: vec3f) -> vec3f {
    return mix(ground, sky, 0.5 + 0.5 * dot(d, up));
}

// Luz indireta que chega a um ponto, nas direções que o fechamento lê (spec 033, R7): a irradiância na normal dos lobos
// de base e no verso dela (translúcido), a radiância na direção especular dominante da base e do verniz e a
// irradiância na normal do verniz. Radiâncias em W/(m²·sr); as irradiâncias divididas por π (a radiância de um ambiente
// uniforme de mesma irradiância).
struct IndirectLight {
    diffuse: vec3f,
    back: vec3f,
    specular: vec3f,
    coat: vec3f,
    coat_diffuse: vec3f,
}

// Direção especular dominante dos lobos de base (Frostbite): a refletida alargada para a normal com a rugosidade.
fn closure_specular_dir(c: Closure, n: vec3f, v: vec3f) -> vec3f {
    let nb = closure_lobe_normal(c.normal, n, v);
    let a = c.specular_roughness * c.specular_roughness;
    return normalize(mix(reflect(-v, nb), nb, a));
}

// Direção especular dominante do verniz.
fn closure_coat_dir(c: Closure, n: vec3f, v: vec3f) -> vec3f {
    let nc = closure_lobe_normal(c.coat_normal, n, v);
    let a = c.coat_roughness * c.coat_roughness;
    return normalize(mix(reflect(-v, nc), nc, a));
}

// Resposta do fechamento à luz indireta (spec 033, R7 — o ambiente geral): o difuso, a subsuperfície e o translúcido
// pela irradiância; os especulares pela radiância na direção dominante, alargada para a irradiância com a rugosidade;
// × os albedos direcionais. Num ambiente uniforme (teste de forno), exato.
fn closure_indirect(c: Closure, n: vec3f, v: vec3f, light: IndirectLight) -> vec3f {
    let nb = closure_lobe_normal(c.normal, n, v);
    let nv = max(dot(nb, v), 1e-4);
    let irr = light.diffuse;

    var spec = vec3f(0.0);
    if (closure_has(CLOSURE_SPECULAR) && c.dielectric_weight + c.conductor_weight > 0.0) {
        let a = c.specular_roughness * c.specular_roughness;
        spec = closure_base_albedo(c, nv) * mix(light.specular * (1.0 - closure_traced(closure_base_mirror(c))), irr, a);
    }
    var under = vec3f(0.0);
    if (closure_has(CLOSURE_DIFFUSE) && c.diffuse_weight > 0.0) {
        under += c.diffuse_weight * c.diffuse_color * irr;
    }
    if (closure_has(CLOSURE_SUBSURFACE) && c.subsurface_weight > 0.0) {
        under += c.subsurface_weight * c.subsurface_color * irr;
    }
    if (closure_has(CLOSURE_TRANSLUCENT) && c.translucent_weight > 0.0) {
        under += c.translucent_weight * c.translucent_color * light.back;
    }
    let base = spec + closure_under_dielectric(c, nv) * under;

    var coat = vec3f(0.0);
    if (closure_has(CLOSURE_COAT) && c.coat_weight > 0.0) {
        let nc = closure_lobe_normal(c.coat_normal, n, v);
        let ncv = max(dot(nc, v), 1e-4);
        let a = c.coat_roughness * c.coat_roughness;
        coat = clamp(c.coat_weight, 0.0, 1.0) * closure_coat_albedo(c, ncv)
            * mix(light.coat * (1.0 - closure_traced(closure_mirror(c.coat_roughness))), light.coat_diffuse, a);
    }
    var sheen = vec3f(0.0);
    if (closure_has(CLOSURE_SHEEN) && c.sheen_weight > 0.0) {
        sheen = clamp(c.sheen_weight, 0.0, 1.0) * c.sheen_color * closure_dfg(nv, c.sheen_roughness).z * irr;
    }
    return sheen + closure_sheen_pass(c, nv) * (coat + closure_coat_pass(c, nv) * base);
}

// O verniz é liso o bastante para o reflexo traçado (o raio refletido sai pela normal dele)?
fn closure_coat_mirrors(c: Closure) -> bool {
    return closure_has(CLOSURE_COAT) && c.coat_weight > 0.0 && closure_mirror(c.coat_roughness) > 0.0;
}

// Direção do raio do reflexo traçado: a especular dominante do verniz, se ele é liso, senão a da base.
fn closure_reflected_dir(c: Closure, n: vec3f, v: vec3f) -> vec3f {
    if (closure_coat_mirrors(c)) { return closure_coat_dir(c, n, v); }
    return closure_specular_dir(c, n, v);
}

// Resposta do fechamento, para `v`, à radiância unitária que chega pelo raio refletido (spec 011, T114): a parte lisa
// dos lobos especulares — o que `closure_indirect` deixa de fora com `CLOSURE_TRACED` —, com os mesmos albedos
// direcionais e as mesmas camadas por cima. A cor é o produto disto pela radiância que o raio achou.
fn closure_reflected(c: Closure, n: vec3f, v: vec3f) -> vec3f {
    let nb = closure_lobe_normal(c.normal, n, v);
    let nv = max(dot(nb, v), 1e-4);
    var spec = vec3f(0.0);
    if (closure_has(CLOSURE_SPECULAR) && c.dielectric_weight + c.conductor_weight > 0.0) {
        let a = c.specular_roughness * c.specular_roughness;
        spec = closure_base_albedo(c, nv) * ((1.0 - a) * closure_base_mirror(c));
    }
    var coat = vec3f(0.0);
    if (closure_has(CLOSURE_COAT) && c.coat_weight > 0.0) {
        let ncv = max(dot(closure_lobe_normal(c.coat_normal, n, v), v), 1e-4);
        let a = c.coat_roughness * c.coat_roughness;
        coat = vec3f(clamp(c.coat_weight, 0.0, 1.0) * closure_coat_albedo(c, ncv)
            * ((1.0 - a) * closure_mirror(c.coat_roughness)));
    }
    return closure_sheen_pass(c, nv) * (coat + closure_coat_pass(c, nv) * spec);
}

// Resposta do fechamento ao hemisfério céu/chão de radiâncias `sky` e `ground` (eixo `up`): o caso particular de
// `closure_indirect` com a luz do hemisfério nas direções que o fechamento lê.
fn closure_ambient(c: Closure, n: vec3f, v: vec3f, sky: vec3f, ground: vec3f, up: vec3f) -> vec3f {
    let nb = closure_lobe_normal(c.normal, n, v);
    let nc = closure_lobe_normal(c.coat_normal, n, v);
    let light = IndirectLight(
        closure_hemisphere(nb, sky, ground, up),
        closure_hemisphere(-nb, sky, ground, up),
        closure_hemisphere(closure_specular_dir(c, n, v), sky, ground, up),
        closure_hemisphere(closure_coat_dir(c, n, v), sky, ground, up),
        closure_hemisphere(nc, sky, ground, up),
    );
    return closure_indirect(c, n, v, light);
}

// O que do lobo de subsuperfície sai para `v` por unidade de luz difundida que chega por dentro ao ponto (irradiância
// sobre π): o peso e o albedo pelo que atravessa o especular dielétrico, o verniz e o sheen de cima — os fatores do lobo
// em `closure_eval` e `closure_indirect` (o passe de subsuperfície do desenho sai por eles).
fn closure_subsurface_exit(c: Closure, n: vec3f, v: vec3f) -> vec3f {
    if (!closure_has(CLOSURE_SUBSURFACE) || c.subsurface_weight <= 0.0) { return vec3f(0.0); }
    let nv = max(dot(closure_lobe_normal(c.normal, n, v), v), 1e-4);
    return c.subsurface_weight * c.subsurface_color * closure_under_dielectric(c, nv) * closure_coat_pass(c, nv)
        * closure_sheen_pass(c, nv);
}

// Emissão que sai do fechamento: atenuada pelo verniz e pelo sheen de cima.
fn closure_emitted(c: Closure, n: vec3f, v: vec3f) -> vec3f {
    if (!closure_has(CLOSURE_EMISSION)) { return vec3f(0.0); }
    let nv = max(dot(closure_lobe_normal(c.normal, n, v), v), 1e-4);
    return c.emission * closure_coat_pass(c, nv) * closure_sheen_pass(c, nv);
}
