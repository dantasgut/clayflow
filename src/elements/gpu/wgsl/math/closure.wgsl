// Fechamento de espalhamento (spec 011, R5): o que o ponto `material` devolve e os nós `bsdf.*`/`closure.*` compõem.
// Lobos fixos por tipo, em "bins" de ordem vertical fixa (como o Blender EEVEE): sheen por cima; o verniz (`coat`); o
// especular de base (a parte dielétrica e a condutora dividem a microgeometria); e, por baixo do especular dielétrico,
// o difuso, a subsuperfície, a parede fina e a transmissão. A emissão fica sob o verniz e o sheen.
//
// Composição: `closure_add` soma os lobos nos seus bins; `closure_mix` interpola. Dois lobos do mesmo tipo no mesmo bin
// fundem os parâmetros pelo peso (rugosidade em α², cores e direções lineares) — a regra de fusão documentada e
// medida. `closure_layer` põe o especular dielétrico de cima no bin do verniz. Os pesos são os da composição; a avaliação
// (`closure_eval`, módulo `closure_eval`) conserva a energia entre os bins por escala de albedo.
// Requer: nada.

// Bits dos lobos (máscara de especialização do avaliador; `CLOSURE_LOBES` no módulo `closure_eval`).
const CLOSURE_DIFFUSE: u32 = 1u;
const CLOSURE_SPECULAR: u32 = 2u;
const CLOSURE_COAT: u32 = 4u;
const CLOSURE_SHEEN: u32 = 8u;
const CLOSURE_TRANSMISSION: u32 = 16u;
const CLOSURE_SUBSURFACE: u32 = 32u;
const CLOSURE_EMISSION: u32 = 64u;
const CLOSURE_THIN_FILM: u32 = 128u;
const CLOSURE_ANISOTROPY: u32 = 256u;
const CLOSURE_OPACITY: u32 = 512u;
const CLOSURE_TRANSLUCENT: u32 = 1024u;

// O struct `Closure` vem do `ClosureSchema` (gerado na montagem).

// Fechamento vazio: nenhum lobo, opaco, IORs no padrão do vidro comum (1,5).
fn closure_zero() -> Closure {
    var c: Closure;
    c.dielectric_ior = 1.5;
    c.dielectric_tint = vec3f(1.0);
    c.conductor_tint = vec3f(1.0);
    c.film_ior = 1.3;
    c.coat_ior = 1.5;
    c.coat_color = vec3f(1.0);
    c.transmission_color = vec3f(1.0);
    c.transmission_ior = 1.5;
    c.opacity = 1.0;
    return c;
}

// Difuso de cor `color` e rugosidade difusa `roughness` (0 = Lambert).
fn closure_diffuse(color: vec3f, roughness: f32) -> Closure {
    var c = closure_zero();
    c.diffuse_weight = 1.0;
    c.diffuse_color = clamp(color, vec3f(0.0), vec3f(1.0));
    c.diffuse_roughness = clamp(roughness, 0.0, 1.0);
    return c;
}

// Especular de condutor (metal): F0 = `f0`, tinta da borda F82 `tint`, rugosidade, anisotropia em [−1, 1] e tangente.
fn closure_conductor(f0: vec3f, tint: vec3f, roughness: f32, anisotropy: f32, tangent: vec3f) -> Closure {
    var c = closure_zero();
    c.conductor_weight = 1.0;
    c.conductor_f0 = clamp(f0, vec3f(0.0), vec3f(1.0));
    c.conductor_tint = clamp(tint, vec3f(0.0), vec3f(1.0));
    c.specular_roughness = clamp(roughness, 0.0, 1.0);
    c.specular_anisotropy = clamp(anisotropy, -1.0, 1.0);
    c.tangent = tangent;
    return c;
}

// Especular de dielétrico: reflexão pelo IOR (≥ 1), tinta, rugosidade, anisotropia e tangente; a energia que não
// reflete segue para os lobos de baixo.
fn closure_dielectric(ior: f32, tint: vec3f, roughness: f32, anisotropy: f32, tangent: vec3f) -> Closure {
    var c = closure_zero();
    c.dielectric_weight = 1.0;
    c.dielectric_ior = max(ior, 1.0);
    c.dielectric_tint = clamp(tint, vec3f(0.0), vec3f(1.0));
    c.specular_roughness = clamp(roughness, 0.0, 1.0);
    c.specular_anisotropy = clamp(anisotropy, -1.0, 1.0);
    c.tangent = tangent;
    return c;
}

// IOR por canal (R, G, B) pelo número de Abbe `abbe` (0 = sem dispersão): n(λ) ≈ n_d + (n_d − 1)/V · k, k de −½ (vermelho,
// linha C) a ½ (azul, linha F).
fn closure_dispersion_iors(ior: f32, abbe: f32) -> vec3f {
    let dispersion = select(0.0, (ior - 1.0) / max(abbe, 10.0), abbe > 0.0);
    return vec3f(ior) + dispersion * vec3f(-0.5, 0.0, 0.5);
}

// Transmissão com refração: IOR (≥ 1), cor atingida a `depth` unidades de percurso (Beer-Lambert; `depth` 0 = sem
// absorção), número de Abbe (0 = sem dispersão) e rugosidade (borra a refração).
fn closure_transmission(ior: f32, color: vec3f, depth: f32, abbe: f32, roughness: f32) -> Closure {
    var c = closure_zero();
    c.transmission_weight = 1.0;
    c.transmission_ior = max(ior, 1.0);
    c.transmission_color = clamp(color, vec3f(0.0), vec3f(1.0));
    c.transmission_depth = max(depth, 0.0);
    c.transmission_abbe = select(0.0, max(abbe, 10.0), abbe > 0.0);
    c.transmission_roughness = clamp(roughness, 0.0, 1.0);
    return c;
}

// Coeficiente de absorção por unidade de percurso do meio da transmissão de `c`, por canal (Beer–Lambert): a cor
// atingida a `depth` de percurso dá −ln(cor)/depth; 0 sem absorção (`depth` 0, ou a cor 1 no canal).
fn closure_absorption(c: Closure) -> vec3f {
    var sigma = vec3f(0.0);
    if (c.transmission_depth > 0.0) {
        for (var k = 0; k < 3; k++) {
            let color = c.transmission_color[k];
            if (color < 1.0) { sigma[k] = -log(max(color, 1e-9)) / c.transmission_depth; }
        }
    }
    return sigma;
}

// Prioridade do meio de `c` na sobreposição de volumes transmissivos (o vidro mergulhado na água: o vidro com a maior
// vale dentro dele, e a borda da água que passa por dentro do vidro não é interface). Empate: o último em que o raio
// entrou. Padrão 0.
fn closure_medium_priority(c: Closure, priority: f32) -> Closure {
    var o = c;
    o.transmission_priority = priority;
    return o;
}

// Transmissão de `c` como parede fina (o `thin_walled` do OpenPBR): placa de espessura zero, sem interior — vidraça,
// bolha, folha de plástico modeladas por uma superfície só. A luz atravessa sem desviar e reflete com as reflexões
// múltiplas entre as duas faces (2R/(1 + R)); a absorção e a rugosidade da transmissão não valem nela.
fn closure_thin_walled(c: Closure) -> Closure {
    var o = c;
    o.transmission_thin = 1.0;
    return o;
}

// Parede fina translúcida (cortina, folha): a luz de trás atravessa espalhada, sem refratar o fundo.
fn closure_translucent(color: vec3f) -> Closure {
    var c = closure_zero();
    c.translucent_weight = 1.0;
    c.translucent_color = clamp(color, vec3f(0.0), vec3f(1.0));
    return c;
}

// Brilho de fibra (veludo, algodão): cor e rugosidade do sheen.
fn closure_sheen(color: vec3f, roughness: f32) -> Closure {
    var c = closure_zero();
    c.sheen_weight = 1.0;
    c.sheen_color = clamp(color, vec3f(0.0), vec3f(1.0));
    c.sheen_roughness = clamp(roughness, 0.03, 1.0);
    return c;
}

// Subsuperfície no modelo (pele, cera, mármore): cor e raio de espalhamento por canal (em [0, 1], o avanço do
// terminador). O passe de espalhamento na tela é da 014.
fn closure_subsurface(color: vec3f, radius: vec3f) -> Closure {
    var c = closure_zero();
    c.subsurface_weight = 1.0;
    c.subsurface_color = clamp(color, vec3f(0.0), vec3f(1.0));
    c.subsurface_radius = clamp(radius, vec3f(0.0), vec3f(1.0));
    return c;
}

// Emissão: cor × luminância (nits), sem teto até o limite do formato.
fn closure_emission(color: vec3f, luminance: f32) -> Closure {
    var c = closure_zero();
    c.emission = max(color, vec3f(0.0)) * max(luminance, 0.0);
    return c;
}

// Média ponderada de dois parâmetros escalares (pesos 0 → o primeiro).
fn closure_merge1(a: f32, wa: f32, b: f32, wb: f32) -> f32 {
    let w = wa + wb;
    return select(a, (a * wa + b * wb) / w, w > 1e-8);
}

// Média ponderada de dois parâmetros vetoriais.
fn closure_merge3(a: vec3f, wa: f32, b: vec3f, wb: f32) -> vec3f {
    let w = wa + wb;
    return select(a, (a * wa + b * wb) / w, w > 1e-8);
}

// Rugosidade fundida em α² (a energia do realce, não a aparência linear da rugosidade).
fn closure_merge_roughness(a: f32, wa: f32, b: f32, wb: f32) -> f32 {
    let a2 = closure_merge1(a * a * a * a, wa, b * b * b * b, wb);
    return sqrt(sqrt(a2));
}

// Direção fundida (normal, tangente): soma ponderada das definidas; 0 continua 0 (a padrão).
fn closure_merge_dir(a: vec3f, wa: f32, b: vec3f, wb: f32) -> vec3f {
    let s = a * select(0.0, wa, dot(a, a) > 0.0) + b * select(0.0, wb, dot(b, b) > 0.0);
    return select(vec3f(0.0), normalize(s), dot(s, s) > 1e-12);
}

// Escala os pesos, a emissão e a opacidade (base de `closure_mix`).
fn closure_scale(c: Closure, k: f32) -> Closure {
    var o = c;
    o.diffuse_weight = c.diffuse_weight * k;
    o.subsurface_weight = c.subsurface_weight * k;
    o.dielectric_weight = c.dielectric_weight * k;
    o.conductor_weight = c.conductor_weight * k;
    o.film_weight = c.film_weight * k;
    o.coat_weight = c.coat_weight * k;
    o.sheen_weight = c.sheen_weight * k;
    o.transmission_weight = c.transmission_weight * k;
    o.translucent_weight = c.translucent_weight * k;
    o.emission = c.emission * k;
    o.opacity = c.opacity * k;
    return o;
}

// Soma dois fechamentos: pesos somados, parâmetros do mesmo bin fundidos pelo peso, emissão somada, opacidade até 1.
fn closure_add(a: Closure, b: Closure) -> Closure {
    var o: Closure;
    o.diffuse_weight = a.diffuse_weight + b.diffuse_weight;
    o.diffuse_color = closure_merge3(a.diffuse_color, a.diffuse_weight, b.diffuse_color, b.diffuse_weight);
    o.diffuse_roughness = closure_merge1(a.diffuse_roughness, a.diffuse_weight, b.diffuse_roughness, b.diffuse_weight);
    o.subsurface_weight = a.subsurface_weight + b.subsurface_weight;
    o.subsurface_color = closure_merge3(a.subsurface_color, a.subsurface_weight, b.subsurface_color, b.subsurface_weight);
    o.subsurface_radius = closure_merge3(a.subsurface_radius, a.subsurface_weight, b.subsurface_radius, b.subsurface_weight);
    o.dielectric_weight = a.dielectric_weight + b.dielectric_weight;
    o.dielectric_ior = closure_merge1(a.dielectric_ior, a.dielectric_weight, b.dielectric_ior, b.dielectric_weight);
    o.dielectric_tint = closure_merge3(a.dielectric_tint, a.dielectric_weight, b.dielectric_tint, b.dielectric_weight);
    o.conductor_weight = a.conductor_weight + b.conductor_weight;
    o.conductor_f0 = closure_merge3(a.conductor_f0, a.conductor_weight, b.conductor_f0, b.conductor_weight);
    o.conductor_tint = closure_merge3(a.conductor_tint, a.conductor_weight, b.conductor_tint, b.conductor_weight);
    let wsa = a.dielectric_weight + a.conductor_weight;
    let wsb = b.dielectric_weight + b.conductor_weight;
    o.specular_roughness = closure_merge_roughness(a.specular_roughness, wsa, b.specular_roughness, wsb);
    o.specular_anisotropy = closure_merge1(a.specular_anisotropy, wsa, b.specular_anisotropy, wsb);
    o.tangent = closure_merge_dir(a.tangent, wsa, b.tangent, wsb);
    o.film_weight = a.film_weight + b.film_weight;
    o.film_thickness = closure_merge1(a.film_thickness, a.film_weight, b.film_thickness, b.film_weight);
    o.film_ior = closure_merge1(a.film_ior, a.film_weight, b.film_ior, b.film_weight);
    o.coat_weight = a.coat_weight + b.coat_weight;
    o.coat_ior = closure_merge1(a.coat_ior, a.coat_weight, b.coat_ior, b.coat_weight);
    o.coat_roughness = closure_merge_roughness(a.coat_roughness, a.coat_weight, b.coat_roughness, b.coat_weight);
    o.coat_color = closure_merge3(a.coat_color, a.coat_weight, b.coat_color, b.coat_weight);
    o.coat_normal = closure_merge_dir(a.coat_normal, a.coat_weight, b.coat_normal, b.coat_weight);
    o.sheen_weight = a.sheen_weight + b.sheen_weight;
    o.sheen_color = closure_merge3(a.sheen_color, a.sheen_weight, b.sheen_color, b.sheen_weight);
    o.sheen_roughness = closure_merge1(a.sheen_roughness, a.sheen_weight, b.sheen_roughness, b.sheen_weight);
    o.transmission_weight = a.transmission_weight + b.transmission_weight;
    let wta = a.transmission_weight;
    let wtb = b.transmission_weight;
    o.transmission_color = closure_merge3(a.transmission_color, wta, b.transmission_color, wtb);
    o.transmission_depth = closure_merge1(a.transmission_depth, wta, b.transmission_depth, wtb);
    o.transmission_ior = closure_merge1(a.transmission_ior, wta, b.transmission_ior, wtb);
    o.transmission_abbe = closure_merge1(a.transmission_abbe, wta, b.transmission_abbe, wtb);
    o.transmission_roughness = closure_merge_roughness(a.transmission_roughness, wta, b.transmission_roughness, wtb);
    o.transmission_priority = max(a.transmission_priority, b.transmission_priority);
    o.transmission_thin = max(a.transmission_thin, b.transmission_thin);
    o.translucent_weight = a.translucent_weight + b.translucent_weight;
    o.translucent_color = closure_merge3(a.translucent_color, a.translucent_weight, b.translucent_color, b.translucent_weight);
    o.emission = a.emission + b.emission;
    o.opacity = min(a.opacity + b.opacity, 1.0);
    let wna = wsa + a.diffuse_weight + a.subsurface_weight + a.transmission_weight + a.translucent_weight;
    let wnb = wsb + b.diffuse_weight + b.subsurface_weight + b.transmission_weight + b.translucent_weight;
    o.normal = closure_merge_dir(a.normal, wna, b.normal, wnb);
    return o;
}

// Interpola dois fechamentos por `t` em [0, 1] (0 = `a`): a mistura por máscara.
fn closure_mix(a: Closure, b: Closure, t: f32) -> Closure {
    let k = clamp(t, 0.0, 1.0);
    return closure_add(closure_scale(a, 1.0 - k), closure_scale(b, k));
}

// Camada: o especular dielétrico de `top` vai ao bin do verniz sobre `base`, com a cor de absorção `top_color` e o peso
// `top_weight`; a normal de `top` vira a do verniz. Os demais lobos de `top` somam-se aos da base (aproximação
// documentada: só o dielétrico tem camada própria). Um verniz já presente na base funde-se pelo peso.
fn closure_layer(top: Closure, base: Closure, top_color: vec3f, top_weight: f32) -> Closure {
    let w = clamp(top_weight, 0.0, 1.0);
    var coat = closure_zero();
    coat.coat_weight = top.dielectric_weight * w;
    coat.coat_ior = top.dielectric_ior;
    coat.coat_roughness = top.specular_roughness;
    coat.coat_color = clamp(top_color, vec3f(0.0), vec3f(1.0));
    coat.coat_normal = top.normal;
    var rest = top;
    rest.dielectric_weight = 0.0;
    rest.opacity = 0.0;
    var o = closure_add(closure_add(base, coat), closure_scale(rest, w));
    o.opacity = base.opacity;
    return o;
}

// Filme fino (iridescência) de espessura em nm (0–2000) e IOR do filme sobre o especular de base.
fn closure_thin_film(c: Closure, thickness_nm: f32, film_ior: f32) -> Closure {
    var o = c;
    o.film_weight = 1.0;
    o.film_thickness = clamp(thickness_nm, 0.0, 2000.0);
    o.film_ior = max(film_ior, 1.0);
    return o;
}

// Opacidade (recorte parcial): multiplica a cobertura por `alpha` em [0, 1].
fn closure_opacity(c: Closure, alpha: f32) -> Closure {
    var o = c;
    o.opacity = c.opacity * clamp(alpha, 0.0, 1.0);
    return o;
}

// Normal própria dos lobos de base (de um nó de normal ou de um campo); comprimento 0 volta à geométrica.
fn closure_normal(c: Closure, n: vec3f) -> Closure {
    var o = c;
    o.normal = select(vec3f(0.0), normalize(n), dot(n, n) > 1e-12);
    return o;
}

// Refletância do fechamento (a cor da superfície, sem a luz): cada lobo pelo peso e pela cor; o especular dielétrico pelo
// F0 do IOR. Aproximada (sem o ângulo nem o verniz): serve para separar a luz da textura (spec 034, a mudança de
// iluminação na resolução temporal), não para sombrear.
fn closure_albedo(c: Closure) -> vec3f {
    let f = (c.dielectric_ior - 1.0) / (c.dielectric_ior + 1.0);
    return c.diffuse_weight * c.diffuse_color + c.subsurface_weight * c.subsurface_color
        + c.dielectric_weight * f * f * c.dielectric_tint + c.conductor_weight * c.conductor_f0
        + c.sheen_weight * c.sheen_color + c.translucent_weight * c.translucent_color;
}

// Fechamento dos parâmetros da 009 (`SurfaceParams`): a "base" do OpenPBR — difuso + especular dielétrico de IOR 1,5 +
// condutor pela metalicidade, com a rugosidade e a emissão da função.
fn closure_from_params(p: SurfaceParams) -> Closure {
    let m = clamp(p.metallic, 0.0, 1.0);
    let r = clamp(p.roughness, 0.0, 1.0);
    let base = closure_add(closure_diffuse(p.base_color.rgb, 0.0), closure_dielectric(1.5, vec3f(1.0), r, 0.0, vec3f(0.0)));
    let metal = closure_conductor(p.base_color.rgb, vec3f(1.0), r, 0.0, vec3f(0.0));
    var c = closure_mix(base, metal, m);
    c.emission = max(p.emissive, vec3f(0.0));
    c.opacity = clamp(p.base_color.a, 0.0, 1.0);
    return c;
}

// Saneamento (spec 011, FR-017): lobo com parâmetro não finito é desligado; pesos e cores negativos vão a 0; emissão
// limitada ao máximo do formato HDR (65 000). Nenhum NaN chega ao alvo.
fn closure_sanitize(c: Closure) -> Closure {
    var o = c;
    let ok_d = finite3(vec3f(c.diffuse_weight, c.diffuse_roughness, 0.0)) && finite3(c.diffuse_color);
    o.diffuse_weight = select(0.0, max(c.diffuse_weight, 0.0), ok_d);
    o.diffuse_color = select(vec3f(0.0), max(c.diffuse_color, vec3f(0.0)), ok_d);
    o.diffuse_roughness = select(0.0, clamp(c.diffuse_roughness, 0.0, 1.0), ok_d);
    let ok_s = finite3(vec3f(c.subsurface_weight, 0.0, 0.0)) && finite3(c.subsurface_color) && finite3(c.subsurface_radius);
    o.subsurface_weight = select(0.0, max(c.subsurface_weight, 0.0), ok_s);
    let ok_sp = finite3(vec3f(c.dielectric_weight, c.dielectric_ior, c.conductor_weight))
        && finite3(vec3f(c.specular_roughness, c.specular_anisotropy, 0.0))
        && finite3(c.dielectric_tint) && finite3(c.conductor_f0) && finite3(c.conductor_tint) && finite3(c.tangent);
    o.dielectric_weight = select(0.0, max(c.dielectric_weight, 0.0), ok_sp);
    o.conductor_weight = select(0.0, max(c.conductor_weight, 0.0), ok_sp);
    o.dielectric_ior = select(1.5, max(c.dielectric_ior, 1.0), ok_sp);
    o.specular_roughness = select(0.5, clamp(c.specular_roughness, 0.0, 1.0), ok_sp);
    o.specular_anisotropy = select(0.0, clamp(c.specular_anisotropy, -1.0, 1.0), ok_sp);
    o.tangent = select(vec3f(0.0), c.tangent, ok_sp);
    let ok_f = finite3(vec3f(c.film_weight, c.film_thickness, c.film_ior));
    o.film_weight = select(0.0, max(c.film_weight, 0.0), ok_f);
    let ok_c = finite3(vec3f(c.coat_weight, c.coat_ior, c.coat_roughness)) && finite3(c.coat_color) && finite3(c.coat_normal);
    o.coat_weight = select(0.0, max(c.coat_weight, 0.0), ok_c);
    o.coat_normal = select(vec3f(0.0), c.coat_normal, ok_c);
    let ok_sh = finite3(vec3f(c.sheen_weight, c.sheen_roughness, 0.0)) && finite3(c.sheen_color);
    o.sheen_weight = select(0.0, max(c.sheen_weight, 0.0), ok_sh);
    let ok_t = finite3(vec3f(c.transmission_weight, c.transmission_depth, c.transmission_ior))
        && finite3(vec3f(c.transmission_abbe, c.transmission_roughness, c.transmission_priority))
        && finite3(c.transmission_color) && finite3(vec3f(c.transmission_thin, 0.0, 0.0));
    o.transmission_weight = select(0.0, max(c.transmission_weight, 0.0), ok_t);
    o.transmission_ior = select(1.5, max(c.transmission_ior, 1.0), ok_t);
    o.transmission_priority = select(0.0, c.transmission_priority, ok_t);
    o.transmission_thin = select(0.0, 1.0, ok_t && c.transmission_thin > 0.5);
    let ok_tl = finite3(vec3f(c.translucent_weight, 0.0, 0.0)) && finite3(c.translucent_color);
    o.translucent_weight = select(0.0, max(c.translucent_weight, 0.0), ok_tl);
    o.emission = select(vec3f(0.0), clamp(c.emission, vec3f(0.0), vec3f(65000.0)), finite3(c.emission));
    o.opacity = select(1.0, clamp(c.opacity, 0.0, 1.0), finite3(vec3f(c.opacity, 0.0, 0.0)));
    o.normal = select(vec3f(0.0), c.normal, finite3(c.normal));
    return o;
}

// ── Superfície molhada (spec 034) ───────────────────────────────────────────────────────────────────────────────────
// A água numa superfície (`wet`): uma película livre de espessura `wet.x` (m) sobre o fechamento e a saturação `wet.y`
// dos poros dele. A cobertura da película cresce com a espessura até cobrir a microgeometria (`CLOSURE_WET_FULL`) e o
// brilho passa a ser o da água: o especular dielétrico com o índice dela, quase liso. A base escurece pela película e
// pela água nos poros, pelo mesmo mecanismo — a luz que volta dela fica presa pela reflexão interna da superfície
// água–ar (Lekner e Dorf 1988: a' = a (1 − rₑ)(1 − rᵢ) / (1 − rᵢ a), rₑ e rᵢ as refletâncias difusas de fora e de dentro
// para n = 1,333); nos poros, a água troca o ar entre os grãos, sem película por cima: escurece sem o brilho.
const CLOSURE_WET_FULL: f32 = 5.0e-5;
const CLOSURE_WET_IOR: f32 = 1.333;
const CLOSURE_WET_R_OUT: f32 = 0.066;
const CLOSURE_WET_R_IN: f32 = 0.474;
const CLOSURE_WET_ROUGHNESS: f32 = 0.03;

fn closure_wet(c: Closure, wet: vec2f) -> Closure {
    let w = clamp(wet.x / CLOSURE_WET_FULL, 0.0, 1.0);
    let dark = max(w, clamp(wet.y, 0.0, 1.0));
    if (dark <= 0.0) { return c; }
    var o = c;
    let a = c.diffuse_color;
    let soaked = a * ((1.0 - CLOSURE_WET_R_OUT) * (1.0 - CLOSURE_WET_R_IN)) / (vec3f(1.0) - CLOSURE_WET_R_IN * a);
    o.diffuse_color = mix(a, soaked, dark);
    o.dielectric_weight = mix(c.dielectric_weight, 1.0, w);
    o.dielectric_ior = mix(c.dielectric_ior, CLOSURE_WET_IOR, w);
    o.dielectric_tint = mix(c.dielectric_tint, vec3f(1.0), w);
    o.specular_roughness = mix(c.specular_roughness, CLOSURE_WET_ROUGHNESS, w);
    return o;
}
