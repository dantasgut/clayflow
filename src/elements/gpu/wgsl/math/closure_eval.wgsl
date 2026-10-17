// Avaliação do fechamento (spec 011, R3/R5): a resposta a uma luz de direção `l` (`closure_eval`) e ao hemisfério
// céu/chão (`closure_ambient`). Camadas por escala de albedo, de cima para baixo: sheen → verniz → especular de base →
// difuso, subsuperfície e parede fina (sob o especular dielétrico). O multiespalhamento do GGX é compensado pela tabela
// DFG (`pbr_dfg`: E = F0·A + B e o albedo do sheen), e as perdas de cada camada são exatamente o que ela reflete — o
// teste de forno fecha em 1.
//
// Especialização: `CLOSURE_LOBES` (constante `override`, bits `CLOSURE_*`) é a máscara dos lobos que o material usa;
// o pipeline a fixa na criação e os ramos dos lobos ausentes saem do código compilado. Sem especializar, todos.
// Requer: closure, bsdf; recursos `pbr_dfg` e `pbr_sampler` (a tabela do `PbrTables`).

override CLOSURE_LOBES: u32 = 2047u;

// O material usa o lobo `bit`? (constante na especialização.)
fn closure_has(bit: u32) -> bool {
    return (CLOSURE_LOBES & bit) != 0u;
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
    let s = select(-1.0, 1.0, n.z >= 0.0);
    let a = -1.0 / (s + n.z);
    let b = n.x * n.y * a;
    return vec3f(1.0 + s * n.x * n.x * a, s * b, -s * n.x);
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

// Resposta do fechamento a uma luz de direção `l` (unitária, da superfície para a luz) e radiância `radiance` que chega
// (irradiância na normal da luz): radiância refletida para `v`. `n` é a normal geométrica de sombreamento.
fn closure_eval(c: Closure, n: vec3f, v: vec3f, l: vec3f, radiance: vec3f) -> vec3f {
    let nb = closure_lobe_normal(c.normal, n, v);
    let nv = max(dot(nb, v), 1e-4);
    let nl_raw = dot(nb, l);
    let nl = max(nl_raw, 0.0);
    let h = normalize(v + l);
    let nh = max(dot(nb, h), 0.0);
    let vh = max(dot(v, h), 0.0);

    // Especular de base.
    var spec = vec3f(0.0);
    if (closure_has(CLOSURE_SPECULAR) && nl > 0.0 && c.dielectric_weight + c.conductor_weight > 0.0) {
        let r = max(c.specular_roughness, BSDF_MIN_ROUGHNESS);
        let alpha = r * r;
        var dv: f32;
        if (closure_has(CLOSURE_ANISOTROPY) && abs(c.specular_anisotropy) > 1e-3) {
            let t0 = select(closure_default_tangent(nb), c.tangent, dot(c.tangent, c.tangent) > 1e-12);
            let t = normalize(t0 - nb * dot(nb, t0));
            let b = cross(nb, t);
            // A tangente é a direção das ranhuras (metal escovado, fio da seda): anisotropia positiva alisa ao longo
            // dela e aspera através dela — o realce se alonga perpendicular à tangente.
            let at = max(alpha * (1.0 - c.specular_anisotropy), 1e-3);
            let ab = max(alpha * (1.0 + c.specular_anisotropy), 1e-3);
            dv = bsdf_d_ggx_aniso(dot(t, h), dot(b, h), nh, at, ab)
                * bsdf_v_smith_correlated_aniso(at, ab, dot(t, v), dot(b, v), dot(t, l), dot(b, l), nv, nl);
        } else {
            let a2 = alpha * alpha;
            dv = bsdf_d_ggx(nh, a2) * bsdf_v_smith_correlated(nv, nl, a2);
        }
        let dfg = closure_dfg(nv, c.specular_roughness);
        let f0d = vec3f(bsdf_f0_from_ior(c.dielectric_ior));
        let ws = max(c.dielectric_weight + c.conductor_weight, 1e-6);
        let f0 = (c.dielectric_weight * f0d * c.dielectric_tint + c.conductor_weight * c.conductor_f0) / ws;
        spec = closure_base_fresnel(c, vh) * dv * nl * bsdf_multiscatter(f0, dfg.x + dfg.y);
    }

    // Lobos de baixo do dielétrico.
    var under = vec3f(0.0);
    if (closure_has(CLOSURE_DIFFUSE) && c.diffuse_weight > 0.0 && nl > 0.0) {
        under += c.diffuse_weight * bsdf_oren_nayar_energy(c.diffuse_color, c.diffuse_roughness, nl, nv, dot(l, v));
    }
    if (closure_has(CLOSURE_SUBSURFACE) && c.subsurface_weight > 0.0) {
        under += c.subsurface_weight * bsdf_burley_wrap(c.subsurface_color, c.subsurface_radius, nl_raw);
    }
    if (closure_has(CLOSURE_TRANSLUCENT) && c.translucent_weight > 0.0) {
        under += c.translucent_weight * c.translucent_color / BSDF_PI * max(-nl_raw, 0.0);
    }
    let base = spec + closure_under_dielectric(c, nv) * under;

    // Verniz.
    var coat = vec3f(0.0);
    if (closure_has(CLOSURE_COAT) && c.coat_weight > 0.0) {
        let nc = closure_lobe_normal(c.coat_normal, n, v);
        let ncl = max(dot(nc, l), 0.0);
        if (ncl > 0.0) {
            let ncv = max(dot(nc, v), 1e-4);
            let r = max(c.coat_roughness, BSDF_MIN_ROUGHNESS);
            let a2 = r * r * r * r;
            let f0 = bsdf_f0_from_ior(c.coat_ior);
            let dfg = closure_dfg(ncv, c.coat_roughness);
            let f = bsdf_f_schlick(vec3f(f0), vec3f(closure_dielectric_f90(f0)), vh).x;
            coat = vec3f(clamp(c.coat_weight, 0.0, 1.0) * f * bsdf_d_ggx(max(dot(nc, h), 0.0), a2)
                * bsdf_v_smith_correlated(ncv, ncl, a2) * ncl * bsdf_multiscatter(vec3f(f0), dfg.x + dfg.y).x);
        }
    }

    // Sheen.
    var sheen = vec3f(0.0);
    if (closure_has(CLOSURE_SHEEN) && c.sheen_weight > 0.0 && nl > 0.0) {
        sheen = clamp(c.sheen_weight, 0.0, 1.0) * c.sheen_color * bsdf_d_charlie(nh, c.sheen_roughness)
            * bsdf_v_neubelt(nv, nl) * nl;
    }

    let below_coat = closure_coat_pass(c, nv) * base;
    return (sheen + closure_sheen_pass(c, nv) * (coat + below_coat)) * radiance;
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
        spec = closure_base_albedo(c, nv) * mix(light.specular, irr, a);
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
        coat = clamp(c.coat_weight, 0.0, 1.0) * closure_coat_albedo(c, ncv) * mix(light.coat, light.coat_diffuse, a);
    }
    var sheen = vec3f(0.0);
    if (closure_has(CLOSURE_SHEEN) && c.sheen_weight > 0.0) {
        sheen = clamp(c.sheen_weight, 0.0, 1.0) * c.sheen_color * closure_dfg(nv, c.sheen_roughness).z * irr;
    }
    return sheen + closure_sheen_pass(c, nv) * (coat + closure_coat_pass(c, nv) * base);
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

// Emissão que sai do fechamento: atenuada pelo verniz e pelo sheen de cima.
fn closure_emitted(c: Closure, n: vec3f, v: vec3f) -> vec3f {
    if (!closure_has(CLOSURE_EMISSION)) { return vec3f(0.0); }
    let nv = max(dot(closure_lobe_normal(c.normal, n, v), v), 1e-4);
    return c.emission * closure_coat_pass(c, nv) * closure_sheen_pass(c, nv);
}
