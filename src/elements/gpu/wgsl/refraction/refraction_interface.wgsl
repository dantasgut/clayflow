// Interface dielétrica da refração traçada (spec 034, R1, T042) — a mesma conta da referência da CPU
// (`sampleDielectricInterface`): a microfaceta GGX pela distribuição visível de normais (Heitz 2018) quando α > 0, o
// Fresnel dielétrico exato não polarizado nela (`bsdf_f_dielectric`, reflexão interna total → 1) e o peso G1 de Smith
// da direção de saída (0 quando ela cai do lado errado da macro-superfície); ao atravessar, (n1/n2)² — a radiância vista
// do lado de chegada. Quem traça decide os lobos: na primeira interface do caminho os dois (cada um com o seu Fresnel),
// nas seguintes um, pela roleta de Fresnel.
// Requer: bsdf.

/** Base ortonormal em volta de `n` (Duff et al. 2017): as colunas t, b, n. */
fn refraction_basis(n: vec3f) -> mat3x3f {
    let s = select(-1.0, 1.0, n.z >= 0.0);
    let a = -1.0 / (s + n.z);
    let b = n.x * n.y * a;
    return mat3x3f(vec3f(1.0 + s * n.x * n.x * a, s * b, -s * n.x), vec3f(b, s + n.y * n.y * a, -n.y), n);
}

/** Mascaramento de Smith do GGX para a direção de cosseno `cos_t` com a normal da macro-superfície. */
fn refraction_g1(cos_t: f32, alpha: f32) -> f32 {
    let c = min(1.0, abs(cos_t));
    if (c <= 0.0) { return 0.0; }
    let tan2 = (1.0 - c * c) / (c * c);
    return 2.0 / (1.0 + sqrt(1.0 + alpha * alpha * tan2));
}

/** Normal de microfaceta pela distribuição visível do GGX para `wo` no referencial local (z = normal), `u` em [0, 1)². */
fn refraction_vndf(wo: vec3f, alpha: f32, u: vec2f) -> vec3f {
    let vh = normalize(vec3f(alpha * wo.x, alpha * wo.y, wo.z));
    let lensq = vh.x * vh.x + vh.y * vh.y;
    let t1 = select(vec3f(1.0, 0.0, 0.0), vec3f(-vh.y, vh.x, 0.0) / sqrt(lensq), lensq > 0.0);
    let t2 = cross(vh, t1);
    let r = sqrt(u.x);
    let phi = 6.283185307179586 * u.y;
    let p1 = r * cos(phi);
    let sv = 0.5 * (1.0 + vh.z);
    let p2 = (1.0 - sv) * sqrt(max(0.0, 1.0 - p1 * p1)) + sv * r * sin(phi);
    let nh = t1 * p1 + t2 * p2 + vh * sqrt(max(0.0, 1.0 - p1 * p1 - p2 * p2));
    return normalize(vec3f(alpha * nh.x, alpha * nh.y, max(1e-7, nh.z)));
}

/** A normal que o raio `d` vê na face `nf` (voltada para ele): a da microfaceta amostrada, ou a própria com α ≈ 0. */
fn refraction_microfacet(d: vec3f, nf: vec3f, alpha: f32, u: vec2f) -> vec3f {
    if (alpha <= 1e-4) { return nf; }
    let tbn = refraction_basis(nf);
    let wo = -d;
    let local = vec3f(dot(wo, tbn[0]), dot(wo, tbn[1]), dot(wo, nf));
    return normalize(tbn * refraction_vndf(local, alpha, u));
}

/** Fresnel exato da interface n1 → n2 para o cosseno de chegada `cos_i` na microfaceta. */
fn refraction_fresnel(cos_i: f32, n1: f32, n2: f32) -> f32 {
    return bsdf_f_dielectric(cos_i, n2 / n1);
}

/** Um lobo que sai da interface: a direção e o peso (sem o Fresnel; 0 = caminho perdido). */
struct RefractionLobe {
    dir: vec3f,
    weight: f32,
}

/** Reflexão de `d` na microfaceta `m` da face `nf`, com o peso G1 da saída. */
fn refraction_reflect(d: vec3f, m: vec3f, nf: vec3f, alpha: f32) -> RefractionLobe {
    let wo = -d;
    let c = dot(wo, m);
    let dir = m * (2.0 * c) - wo;
    if (c <= 0.0 || dot(dir, nf) <= 0.0) { return RefractionLobe(dir, 0.0); }
    return RefractionLobe(dir, select(1.0, refraction_g1(dot(dir, nf), alpha), alpha > 1e-4));
}

/** Refração de `d` de n1 para n2 na microfaceta `m` da face `nf`, com G1 e (n1/n2)²; 0 na reflexão interna total. */
fn refraction_transmit(d: vec3f, m: vec3f, nf: vec3f, n1: f32, n2: f32, alpha: f32) -> RefractionLobe {
    let wo = -d;
    let c = dot(wo, m);
    let eta = n1 / n2;
    let sin2t = eta * eta * (1.0 - c * c);
    if (c <= 0.0 || sin2t >= 1.0) { return RefractionLobe(d, 0.0); }
    let dir = normalize(d * eta + m * (eta * c - sqrt(1.0 - sin2t)));
    if (dot(dir, nf) >= 0.0) { return RefractionLobe(dir, 0.0); }
    let g = select(1.0, refraction_g1(dot(dir, nf), alpha), alpha > 1e-4);
    return RefractionLobe(dir, g * eta * eta);
}
