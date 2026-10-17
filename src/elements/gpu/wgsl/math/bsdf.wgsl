// Funções físicas de espalhamento (spec 011, R3): GGX isotrópica e anisotrópica, visibilidade de Smith correlacionada,
// Fresnel de Schlick, F82 do OpenPBR e o exato dos dielétricos, difuso de Oren-Nayar energético (EON), sheen "Charlie"
// com a visibilidade de Neubelt, difuso com "wrap" por canal (subsuperfície no modelo), filme fino de Belcour-Barla e o
// controle de serrilhado especular de Tokuyoshi-Kaplanyan. Funções puras; a referência de CPU é
// `elements/material/reference/bsdf.ts`.
// Requer: nada.

const BSDF_PI: f32 = 3.14159265358979;
// Rugosidade mínima efetiva: abaixo dela o realce de uma luz pontual vira um pixel.
const BSDF_MIN_ROUGHNESS: f32 = 0.03;

// α² do GGX a partir da rugosidade perceptual (α = r²), com o piso.
fn bsdf_alpha2(roughness: f32) -> f32 {
    let r = max(roughness, BSDF_MIN_ROUGHNESS);
    let a = r * r;
    return a * a;
}

// Distribuição GGX (Trowbridge-Reitz) isotrópica.
fn bsdf_d_ggx(n_dot_h: f32, a2: f32) -> f32 {
    let d = n_dot_h * n_dot_h * (a2 - 1.0) + 1.0;
    return a2 / (BSDF_PI * d * d);
}

// Distribuição GGX anisotrópica (Burley 2012): `h_t`, `h_b` são as projeções de h na tangente e na bitangente.
fn bsdf_d_ggx_aniso(h_t: f32, h_b: f32, n_dot_h: f32, at: f32, ab: f32) -> f32 {
    let x = h_t / at;
    let y = h_b / ab;
    let d = x * x + y * y + n_dot_h * n_dot_h;
    return 1.0 / (BSDF_PI * at * ab * d * d);
}

// Visibilidade de Smith correlacionada em altura (Heitz 2014): G₂ / (4·n·v·n·l).
fn bsdf_v_smith_correlated(n_dot_v: f32, n_dot_l: f32, a2: f32) -> f32 {
    let gv = n_dot_l * sqrt(n_dot_v * n_dot_v * (1.0 - a2) + a2);
    let gl = n_dot_v * sqrt(n_dot_l * n_dot_l * (1.0 - a2) + a2);
    return 0.5 / max(gv + gl, 1e-7);
}

// Visibilidade de Smith correlacionada anisotrópica (Heitz 2014).
fn bsdf_v_smith_correlated_aniso(
    at: f32, ab: f32, t_v: f32, b_v: f32, t_l: f32, b_l: f32, n_dot_v: f32, n_dot_l: f32,
) -> f32 {
    let lv = n_dot_l * length(vec3f(at * t_v, ab * b_v, n_dot_v));
    let ll = n_dot_v * length(vec3f(at * t_l, ab * b_l, n_dot_l));
    return 0.5 / max(lv + ll, 1e-7);
}

// Fresnel de Schlick.
fn bsdf_f_schlick(f0: vec3f, f90: vec3f, cos_t: f32) -> vec3f {
    let k = pow(1.0 - clamp(cos_t, 0.0, 1.0), 5.0);
    return f0 + (f90 - f0) * k;
}

// Fresnel F82-tint do OpenPBR (Kutz et al. 2021): Schlick com o desvio em μ̄ = 1/7 que leva a refletância a
// `tint · F_schlick(μ̄)`; tinta branca = Schlick.
fn bsdf_f82(f0: vec3f, tint: vec3f, cos_t: f32) -> vec3f {
    let mu = clamp(cos_t, 0.0, 1.0);
    let mu_bar = 1.0 / 7.0;
    let denom = mu_bar * pow(1.0 - mu_bar, 6.0);
    let f_bar = bsdf_f_schlick(f0, vec3f(1.0), mu_bar);
    let fs = bsdf_f_schlick(f0, vec3f(1.0), mu);
    let k = mu * pow(1.0 - mu, 6.0);
    return clamp(fs - k * f_bar * (vec3f(1.0) - tint) / denom, vec3f(0.0), vec3f(1.0));
}

// Refletância na normal de uma interface com razão de IOR `ior`.
fn bsdf_f0_from_ior(ior: f32) -> f32 {
    let r = (ior - 1.0) / (ior + 1.0);
    return r * r;
}

// Fresnel dielétrico exato (não polarizado) para a razão de IOR `eta` = n₂/n₁; reflexão total → 1.
fn bsdf_f_dielectric(cos_i: f32, eta: f32) -> f32 {
    let c = clamp(abs(cos_i), 0.0, 1.0);
    let g2 = eta * eta - 1.0 + c * c;
    if (g2 < 0.0) { return 1.0; }
    let g = sqrt(g2);
    let a = (g - c) / (g + c);
    let b = (c * (g + c) - 1.0) / (c * (g - c) + 1.0);
    return 0.5 * a * a * (1.0 + b * b);
}

// Distribuição "Charlie" do sheen (Estevez-Kulla 2017).
fn bsdf_d_charlie(n_dot_h: f32, roughness: f32) -> f32 {
    let a = max(roughness * roughness, 1e-3);
    let inv = 1.0 / a;
    let sin2 = max(1.0 - n_dot_h * n_dot_h, 0.0);
    return (2.0 + inv) * pow(sin2, inv * 0.5) / (2.0 * BSDF_PI);
}

// Visibilidade do sheen (Neubelt-Pettineo 2013).
fn bsdf_v_neubelt(n_dot_v: f32, n_dot_l: f32) -> f32 {
    return 1.0 / (4.0 * max(n_dot_l + n_dot_v - n_dot_l * n_dot_v, 1e-4));
}

// Albedo direcional do Oren-Nayar de Fujii (exato), parte da forma energética (EON, Portsmouth et al. 2024).
fn bsdf_e_fon(mu: f32, r: f32) -> f32 {
    let c1 = 0.5 - 2.0 / (3.0 * BSDF_PI);
    let af = 1.0 / (1.0 + c1 * r);
    let bf = r * af;
    let si = sqrt(max(1.0 - mu * mu, 0.0));
    let g = si * (acos(clamp(mu, 0.0, 1.0)) - si * mu) + (2.0 / 3.0) * ((si / max(mu, 1e-7)) * (1.0 - si * si * si) - si);
    return af + (bf / BSDF_PI) * g;
}

// Difuso de Oren-Nayar energético (EON, o difuso do OpenPBR): o termo de Fujii mais o múltiplo espalhamento que
// devolve a energia perdida; rugosidade 0 = Lambert. Devolve f·cos (pronto para multiplicar pela radiância).
fn bsdf_oren_nayar_energy(rho: vec3f, roughness: f32, n_dot_l: f32, n_dot_v: f32, l_dot_v: f32) -> vec3f {
    let r = clamp(roughness, 0.0, 1.0);
    let c1 = 0.5 - 2.0 / (3.0 * BSDF_PI);
    let c2 = 2.0 / 3.0 - 28.0 / (15.0 * BSDF_PI);
    let af = 1.0 / (1.0 + c1 * r);
    let bf = r * af;
    let s = l_dot_v - n_dot_l * n_dot_v;
    let t = select(1.0, max(n_dot_l, n_dot_v), s > 0.0);
    let single = (af + bf * s / t) / BSDF_PI;
    let e_avg = af * (1.0 + c2 * r);
    let ms = (1.0 - bsdf_e_fon(n_dot_l, r)) * (1.0 - bsdf_e_fon(n_dot_v, r)) / max(BSDF_PI * (1.0 - e_avg), 1e-7);
    let rho_ms = rho * rho * e_avg / max(vec3f(1.0) - rho * (1.0 - e_avg), vec3f(1e-7));
    return (rho * single + rho_ms * ms) * n_dot_l;
}

// Difuso com "wrap" por canal (subsuperfície no modelo): o terminador avança `w` em cada canal pelo raio de
// espalhamento, normalizado para conservar a energia sob luz frontal. Devolve f·cos.
fn bsdf_burley_wrap(color: vec3f, radius: vec3f, n_dot_l: f32) -> vec3f {
    let w = clamp(radius, vec3f(0.0), vec3f(1.0));
    return color / BSDF_PI * max(vec3f(n_dot_l) + w, vec3f(0.0)) / ((vec3f(1.0) + w) * (vec3f(1.0) + w));
}

// Sensibilidade espectral (ajuste gaussiano XYZ, Belcour-Barla 2017) para a diferença de caminho `opd` e a fase `shift`.
fn bsdf_eval_sensitivity(opd: f32, shift: vec3f) -> vec3f {
    let phase = 2.0 * BSDF_PI * opd * 1e-9;
    let val = vec3f(5.4856e-13, 4.4201e-13, 5.2481e-13);
    let pos = vec3f(1.681e6, 1.7953e6, 2.2084e6);
    let vr = vec3f(4.3278e9, 9.3046e9, 6.6121e9);
    var xyz = val * sqrt(2.0 * BSDF_PI * vr) * cos(pos * phase + shift) * exp(-phase * phase * vr);
    xyz.x = xyz.x + 9.747e-14 * sqrt(2.0 * BSDF_PI * 4.5282e9) * cos(2.2399e6 * phase + shift.x)
        * exp(-4.5282e9 * phase * phase);
    xyz = xyz / 1.0685e-7;
    return vec3f(
        3.2404542 * xyz.x - 1.5371385 * xyz.y - 0.4985314 * xyz.z,
        -0.969266 * xyz.x + 1.8760108 * xyz.y + 0.041556 * xyz.z,
        0.0556434 * xyz.x - 0.2040259 * xyz.y + 1.0572252 * xyz.z,
    );
}

// Refletância de filme fino (Belcour-Barla 2017, a do `KHR_materials_iridescence`): interferência entre o ar, o filme
// (`film_ior`, espessura em nm) e a base (F0 da base). Espessura 0 = Fresnel da base.
fn bsdf_thin_film(cos_t: f32, thickness_nm: f32, film_ior: f32, base_f0: vec3f) -> vec3f {
    let cos1 = clamp(cos_t, 0.0, 1.0);
    if (thickness_nm <= 0.0) { return bsdf_f_schlick(base_f0, vec3f(1.0), cos1); }
    let eta = max(film_ior, 1.0001);
    let sin2 = (1.0 - cos1 * cos1) / (eta * eta);
    if (sin2 >= 1.0) { return vec3f(1.0); }
    let cos2 = sqrt(1.0 - sin2);
    let r0 = bsdf_f0_from_ior(eta);
    let r12 = bsdf_f_schlick(vec3f(r0), vec3f(1.0), cos1).x;
    let t121 = 1.0 - r12;
    let phi12 = select(0.0, BSDF_PI, eta < 1.0);
    let phi21 = BSDF_PI - phi12;
    let s = sqrt(min(base_f0, vec3f(0.9999)));
    let base_ior = (vec3f(1.0) + s) / (vec3f(1.0) - s);
    let rr = (base_ior - vec3f(eta)) / (base_ior + vec3f(eta));
    let r23 = bsdf_f_schlick(rr * rr, vec3f(1.0), cos2);
    let phi23 = select(vec3f(0.0), vec3f(BSDF_PI), base_ior < vec3f(eta));
    let opd = 2.0 * eta * thickness_nm * cos2;
    let phi = vec3f(phi21) + phi23;
    let r123 = clamp(r12 * r23, vec3f(1e-5), vec3f(0.9999));
    let r_coh = t121 * t121 * r23 / (vec3f(1.0) - r123);
    var i = vec3f(r12) + r_coh;
    var cm = r_coh - vec3f(t121);
    for (var m = 1; m <= 2; m = m + 1) {
        cm = cm * sqrt(r123);
        i = i + cm * 2.0 * bsdf_eval_sensitivity(f32(m) * opd, f32(m) * phi);
    }
    return max(i, vec3f(0.0));
}

// Variância da normal na tela (Tokuyoshi-Kaplanyan 2019), pelas derivadas de tela: chamar só no fragment e em fluxo
// uniforme (no início do `fs`), antes de qualquer ramo por material.
fn bsdf_normal_variance(n: vec3f) -> f32 {
    let dx = dpdx(n);
    let dy = dpdy(n);
    return 0.25 * (dot(dx, dx) + dot(dy, dy));
}

// Controle de serrilhado especular (Tokuyoshi-Kaplanyan 2019): alarga α² pela variância da normal na tela, para que
// detalhe fino de geometria não cintile.
fn bsdf_specular_aa(a2: f32, variance: f32) -> f32 {
    return clamp(a2 + min(2.0 * variance, 0.18), 0.0, 1.0);
}

// Compensação de múltiplo espalhamento (Turquin 2019 / Fdez-Agüera): `1 + F0·(1/E_ss − 1)`.
fn bsdf_multiscatter(f0: vec3f, e_ss: f32) -> vec3f {
    return vec3f(1.0) + f0 * (1.0 / max(e_ss, 1e-4) - 1.0);
}
