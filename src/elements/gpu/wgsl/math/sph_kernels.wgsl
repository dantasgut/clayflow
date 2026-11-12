// portado de legacy/elements/physics/gpu/wgsl/math/sph_kernels.wgsl.ts
// Cubic Spline W₃(r, h): valor escalar
fn W_cubic(r: f32, h: f32) -> f32 {
    let q     = r / h;
    let sigma = 1.0 / (PI * h * h * h);
    if (q < 1.0) {
        return sigma * (1.0 - 1.5*q*q + 0.75*q*q*q);
    } else if (q < 2.0) {
        let d = 2.0 - q;
        return sigma * 0.25 * d * d * d;
    }
    return 0.0;
}

// Laplaciano ∇²W_visc(r, h): escalar sempre ≥ 0 (Müller 2003)
// Suporte: r < h  (diferente do Cubic Spline que tem suporte 2h)
fn laplacian_W_visc(r: f32, h: f32) -> f32 {
    if (r >= h) { return 0.0; }
    return 45.0 / (PI * pow(h, 6.0)) * (h - r);
}

// Gradiente ∇W₃(r_vec, r, h): vetor 3D
fn grad_W_cubic(r_vec: vec3f, r: f32, h: f32) -> vec3f {
    if (r < 0.0001 || r >= 2.0 * h) { return vec3f(0.0); }
    let q     = r / h;
    let sigma = 1.0 / (PI * h * h * h);
    var dq: f32;
    if (q < 1.0) {
        dq = sigma * (-3.0*q + 2.25*q*q) / h;
    } else {
        let d = 2.0 - q;
        dq = sigma * (-0.75 * d * d) / h;
    }
    return dq * r_vec / r;
}

// Poly6 W(r, h): suave perto do centro
fn W_poly6(r_sq: f32, h: f32) -> f32 {
    let h_sq = h * h;
    if (r_sq >= h_sq) { return 0.0; }
    let d = h_sq - r_sq;
    // 315 / (64 * PI * h^9)
    let coeff = 315.0 / (64.0 * PI * pow(h, 9.0));
    return coeff * d * d * d;
}

// Gradiente do Poly6 ∇W(r_vec, h) = −(945/32π h⁹) (h² − r²)² r_vec: o núcleo da fronteira do PBF (a normal da tensão
// contínua soma o fluido e o sólido no mesmo núcleo, para se anularem junto de uma parede coberta).
fn grad_W_poly6(r_vec: vec3f, r_sq: f32, h: f32) -> vec3f {
    let h_sq = h * h;
    if (r_sq >= h_sq) { return vec3f(0.0); }
    let d = h_sq - r_sq;
    return (-945.0 / (32.0 * PI * pow(h, 9.0))) * d * d * r_vec;
}

// Gradiente Spiky ∇W(r, h): não nulo em r=0; bom para pressão
fn grad_W_spiky(r_vec: vec3f, r: f32, h: f32) -> vec3f {
    if (r <= 0.0001 || r >= h) { return vec3f(0.0); }
    // -45 / (PI * h^6) * (h - r)^2 / r * r_vec
    let coeff = -45.0 / (PI * pow(h, 6.0));
    let d = h - r;
    return coeff * (d * d / r) * r_vec;
}

// ── Coesão e adesão moleculares (Akinci, Akinci e Teschner 2013; spec 030) ─────────────────────────────────────────
// Suporte H = alcance da vizinhança do solver (2h na spline cúbica do SPH, h no poly6/spiky do PBF).

// Núcleo de coesão C(r, H): atração em (H/2, H], repulsão perto de 0 (evita aglomerar).
fn akinci_cohesion(r: f32, H: f32) -> f32 {
    if (r <= 0.0 || r > H) { return 0.0; }
    let coeff = 32.0 / (PI * pow(H, 9.0));
    let a = (H - r) * (H - r) * (H - r) * r * r * r;
    if (2.0 * r > H) { return coeff * a; }
    let H6 = H * H * H * H * H * H;
    return coeff * (2.0 * a - H6 / 64.0);
}

// A coesão de Akinci de i por j: −γ mⱼ C(r) r̂, com a correção Kᵢⱼ = 2ρ₀ / (ρᵢ + ρⱼ) que reforça a borda
// (menos vizinhos) sem aglomerar — limitada a 2 (ρᵢ + ρⱼ ≥ ρ₀): entre partículas soltas a densidade cai à auto-contribuição e o
// fator sem limite as arremessaria. `xij` = xᵢ − xⱼ, r > 0. A atração entre as partículas da tensão superficial (a
// curvatura é a da tensão contínua, spec 034 T066e).
fn akinci_cohesion_accel(
    xij: vec3f,
    r: f32,
    H: f32,
    gamma: f32,
    mass_j: f32,
    rho0: f32,
    rho_i: f32,
    rho_j: f32,
) -> vec3f {
    let k_ij = 2.0 * rho0 / max(rho_i + rho_j, rho0);
    return -k_ij * gamma * mass_j * akinci_cohesion(r, H) * (xij / r);
}

// A curvatura de Akinci de i por j: −γ Kᵢⱼ (nᵢ − nⱼ), com a normal n = H ∇c (`grad_i`/`grad_j`: o ∇c com o sólido
// contado como fluido, o da tensão contínua, vezes o suporte).
fn akinci_curvature_accel(grad_i: vec3f, grad_j: vec3f, H: f32, gamma: f32, rho0: f32, rho_i: f32, rho_j: f32) -> vec3f {
    let k_ij = 2.0 * rho0 / max(rho_i + rho_j, rho0);
    return -k_ij * gamma * H * (grad_i - grad_j);
}

// Perfil do núcleo de adesão de Akinci em u = r/H: (−4u² + 6u − 2)^¼ em [½, 1] (A = 0,007/H³ · este valor).
fn akinci_adhesion_profile(u: f32) -> f32 {
    return pow(max(-4.0 * u * u + 6.0 * u - 2.0, 0.0), 0.25);
}

// Integral de meio-espaço da adesão a distância δ = d/H da fronteira (componente normal; a tangencial se cancela):
// ∫_{max(δ,½)}^1 a(u) (u² − δ²) du, por Gauss-Legendre de 8 pontos. A fronteira é tratada como localmente plana.
fn akinci_adhesion_half_space(delta: f32) -> f32 {
    let lo = max(delta, 0.5);
    if (lo >= 1.0) { return 0.0; }
    let x = array<f32, 4>(0.1834346424956498, 0.5255324099163290, 0.7966664774136267, 0.9602898564975363);
    let w = array<f32, 4>(0.3626837833783620, 0.3137066458778873, 0.2223810344533745, 0.1012285362903763);
    let half = 0.5 * (1.0 - lo);
    let mid = 0.5 * (1.0 + lo);
    let d2 = delta * delta;
    var sum = 0.0;
    for (var k = 0u; k < 4u; k++) {
        let ua = mid - half * x[k];
        let ub = mid + half * x[k];
        sum += w[k] * (akinci_adhesion_profile(ua) * (ua * ua - d2) + akinci_adhesion_profile(ub) * (ub * ub - d2));
    }
    return sum * half;
}

// ── Tensão superficial contínua (CSF: Brackbill et al. 1992, Morris 2000) e molhagem (Breinlinger et al. 2013) ────
// A força por volume é σ κ ∇c, com c a cor (1 no fluido): ∇c = Σ V ∇W mais o sólido contado como fluido (a fronteira
// de Akinci, Σ_sólido V ∇W = −Σ −B' n) — no miolo e junto de uma parede coberta de água ele se anula; na superfície
// livre aponta para dentro do fluido, com |∇c| integrando a 1 através dela. A curvatura κ = −∇·n̂ vem só das
// vizinhas com normal (a borda), renormalizada pelo suporte que elas cobrem. O sólido entra na divergência como vizinho
// com a normal do ângulo de contato de Young (a parede de Breinlinger, aqui como meio-espaço): o menisco, a poça e a
// gota pousada saem da curvatura, sem força de adesão.

// |∇c| mínimo (× 1/h) para a normal unitária valer: abaixo, a partícula é miolo e fica fora da curvatura.
const CSF_NORMAL_MIN: f32 = 0.1;
// Suporte mínimo coberto pelas vizinhas com normal (Σ V |∇W| r; 3 com o suporte cheio) para a curvatura valer.
const CSF_SUPPORT_MIN: f32 = 0.3;
// A parede só entra na linha de contato: a borda cuja normal tem componente ao longo do sólido; a de uma lâmina fina (a
// normal quase perpendicular a ele, a superfície de cima vista pela camada de baixo) não é linha de contato — a
// passagem é suave em |n − (n·w) w| de `.x` a `.y`.
const CSF_CONTACT_LINE: vec2f = vec2f(0.3, 0.7);

// A normal da tensão contínua: o ∇c do fluido guardado nos pools de normais (`fluid`, Σ V ∇W) mais o sólido contado
// como fluido (`boundary`: o termo da fronteira, Σ −B' n, do mesmo passo) — (n̂, |∇c|), ou zero no miolo.
fn csf_normal(fluid: vec3f, boundary: vec3f, h: f32) -> vec4f {
    let grad = fluid - boundary;
    let len = length(grad);
    if (len < CSF_NORMAL_MIN / h) { return vec4f(0.0); }
    return vec4f(grad / len, len);
}

// A normal da parede no ângulo de Young θ para a borda de normal `n` junto de um sólido de normal `w` (para fora dele):
// −cos θ w + sen θ t, com t a direção de `n` ao longo do sólido (para o lado do líquido). θ = 0 (molha tudo): a normal
// entra no sólido (a película); θ = 180°: sai dele (a gota pousada).
fn csf_young_normal(n: vec3f, w: vec3f, cos_theta: f32) -> vec3f {
    let along = n - dot(n, w) * w;
    let sin_theta = sqrt(max(1.0 - cos_theta * cos_theta, 0.0));
    return -cos_theta * w + sin_theta * (along / max(length(along), 1e-6));
}

// Σ_sólido V |∇W| r do núcleo sobre o sólido além de um plano a distância `d` (o suporte que a parede cobre na
// divergência): ∫_{|d|}^{H} |W'(r)| r · 2π r (r − |d|) dr, em q = r/h por Gauss-Legendre de 4 pontos por trecho — na
// spline cúbica 2 ∫ |f'(q)| q² (q − δ) dq em [δ, 1] e [1, 2]; no poly6 (945/16) ∫ (1 − q²)² q³ (q − δ) dq em [δ, 1].
// Dentro do sólido (d < 0), o mesmo com δ = 0 mais o resto do espaço não conta (a partícula não vive lá).
fn csf_wall_support(d: f32, h: f32, poly6: bool) -> f32 {
    let delta = max(d, 0.0) / h;
    let x = array<f32, 4>(-0.8611363115940526, -0.3399810435848563, 0.3399810435848563, 0.8611363115940526);
    let w = array<f32, 4>(0.3478548451374538, 0.6521451548625461, 0.6521451548625461, 0.3478548451374538);
    var sum = 0.0;
    for (var seg = 0u; seg < 2u; seg++) {
        let a = select(max(delta, 1.0), delta, seg == 0u);
        let b = select(2.0, 1.0, seg == 0u);
        if (a >= b || (poly6 && seg == 1u)) { continue; }
        let half = 0.5 * (b - a);
        let mid = 0.5 * (a + b);
        for (var k = 0u; k < 4u; k++) {
            let q = mid + half * x[k];
            var f = 0.0;
            if (poly6) {
                let e = 1.0 - q * q;
                f = (945.0 / 16.0) * e * e * q * q * q * (q - delta);
            } else {
                let df = select(0.75 * (2.0 - q) * (2.0 - q), 3.0 * q - 2.25 * q * q, seg == 0u);
                f = 2.0 * df * q * q * (q - delta);
            }
            sum += w[k] * half * f;
        }
    }
    return sum;
}

// A parcela da parede na divergência da borda `n_i` (sem o volume V, como as das vizinhas): ((n_w − n̂ᵢ)·B' w,
// Σ_sólido |∇W| r), com n_w a normal de Young, `contact` o sólido mais próximo (normal para fora dele, distância) e
// `boundary` = (B, B') do núcleo nele; só na linha de contato.
fn csf_wall_pair(n_i: vec4f, contact: vec4f, boundary: vec2f, support: f32, cos_theta: f32, volume: f32) -> vec2f {
    if (n_i.w <= 0.0 || !any(contact.xyz != vec3f(0.0))) { return vec2f(0.0); }
    let w = contact.xyz;
    let weight = smoothstep(CSF_CONTACT_LINE.x, CSF_CONTACT_LINE.y, length(n_i.xyz - dot(n_i.xyz, w) * w));
    if (weight <= 0.0) { return vec2f(0.0); }
    let n_w = csf_young_normal(n_i.xyz, w, cos_theta);
    return weight * vec2f(dot(n_w - n_i.xyz, boundary.y * w), support) / volume;
}

// A reação do sólido à tensão contínua junto dele (a menos de `reach`, a primeira camada): a parede sustenta a componente
// que entra nela (a normal da borda, com o sólido contado como fluido, se inclina para ele na linha de contato) —
// sem isso a borda era empurrada para dentro do sólido. A que puxa para fora fica.
fn csf_wall_reaction(a: vec3f, contact: vec4f, reach: f32) -> vec3f {
    if (contact.w >= reach || !any(contact.xyz != vec3f(0.0))) { return a; }
    return a - min(dot(a, contact.xyz), 0.0) * contact.xyz;
}

// A parcela da vizinha j na divergência da normal: ((n̂ⱼ − n̂ᵢ)·∇ᵢW, |∇ᵢW| r) — só vizinhas com normal (w > 0).
fn csf_divergence_pair(n_i: vec4f, n_j: vec4f, gw: vec3f, r: f32) -> vec2f {
    if (n_j.w <= 0.0) { return vec2f(0.0); }
    return vec2f(dot(n_j.xyz - n_i.xyz, gw), length(gw) * r);
}

// A borda resolvida: com normal e com suporte de vizinhas com normal para a curvatura.
fn csf_resolved(n_i: vec4f, sums: vec2f, volume: f32) -> bool {
    return n_i.w > 0.0 && sums.y * volume >= CSF_SUPPORT_MIN;
}

// A lâmina mais fina que o núcleo junto de um sólido (`contact` a menos de `reach`): a normal da borda entra nele (o
// líquido fica entre a partícula e o sólido) sem componente ao longo dele (não é a linha de contato, que espalha ou
// recolhe a lâmina pelo ângulo de Young) — abaixo da resolução na espessura, como a gotinha solta.
fn csf_thin_film(n_i: vec4f, contact: vec4f, reach: f32) -> bool {
    if (n_i.w <= 0.0 || contact.w >= reach) { return false; }
    let w = contact.xyz;
    return dot(n_i.xyz, w) < 0.0 && length(n_i.xyz - dot(n_i.xyz, w) * w) < CSF_CONTACT_LINE.x;
}

// A adesão de Akinci da borda não resolvida ao sólido mais próximo (`contact`: normal para fora dele, distância): a
// aceleração `accel` vezes a integral de meio-espaço do núcleo em δ = d/H, para dentro do sólido (a força normal de
// `collider_adhesion_contact`; o arrasto tangencial fica na colisão).
fn akinci_adhesion_accel(contact: vec4f, H: f32, accel: f32) -> vec3f {
    if (accel <= 0.0 || contact.w >= H || !any(contact.xyz != vec3f(0.0))) { return vec3f(0.0); }
    return -accel * akinci_adhesion_half_space(max(contact.w, 0.0) / H) * contact.xyz;
}

// A aceleração da tensão contínua: (σ/ρ₀) κ |∇c| n̂, com κ = −2 Σ V (n̂ⱼ − n̂ᵢ)·∇W / Σ V |∇W| r — a divergência na
// superfície: as vizinhas com normal formam uma casca, e nela Σ V rⱼᵢ ⊗ ∇W é ½ Σ V |∇W| r no plano tangente
// (conferido contra 2/R numa esfera de partículas, `reference/surfaceTension.ts`) — limitada a ±2/h (a menor esfera
// que a vizinhança resolve). `sums` = (Σ (n̂ⱼ − n̂ᵢ)·∇W, Σ |∇W| r) sem o volume V; `sigma` = σ/ρ₀ dividido pela fração
// da interface que as partículas amostram (`ParticlePhysics.surfaceTensionKernel`), m³/s².
fn csf_accel(n_i: vec4f, sums: vec2f, volume: f32, sigma: f32, h: f32) -> vec3f {
    if (!csf_resolved(n_i, sums, volume)) { return vec3f(0.0); }
    let kappa = clamp(-2.0 * sums.x / sums.y, -2.0 / h, 2.0 / h);
    return sigma * kappa * n_i.w * n_i.xyz;
}

// O peso da linha de contato da borda `n_i` junto do sólido `contact` a menos de `reach`: a passagem suave em
// |n − (n·w) w| (a normal com componente ao longo do sólido: a superfície livre encontra o sólido ali).
fn csf_contact_line(n_i: vec4f, contact: vec4f, reach: f32) -> f32 {
    if (n_i.w <= 0.0 || contact.w >= reach || !any(contact.xyz != vec3f(0.0))) { return 0.0; }
    let w = contact.xyz;
    return smoothstep(CSF_CONTACT_LINE.x, CSF_CONTACT_LINE.y, length(n_i.xyz - dot(n_i.xyz, w) * w));
}

// A tensão superficial de uma partícula (spec 034, T066e), pelo regime:
//   - a linha de contato (a borda resolvida junto de um sólido com normal ao longo dele, peso `csf_contact_line`): a
//     tensão contínua com a parede de Young na divergência (`sums` já com ela) e a reação do sólido na primeira camada
//     (`wall_layer`) — a molhagem que o par coesão + adesão de Akinci não dá nessa resolução (tudo ou nada, T066a: o
//     alcance da adesão, 2,6 espaçamentos, cobre a altura de uma poça que molha);
//   - abaixo da resolução junto de um sólido — a gotinha solta, o fragmento menor que o núcleo (`!csf_resolved`) e a
//     lâmina mais fina que o núcleo (`csf_thin_film`) —: a coesão de Akinci e a adesão normal ao sólido mais próximo;
//   - o resto (o miolo, a borda longe dos sólidos e a que fica de frente para eles): o modelo de Akinci et al. 2013, a
//     coesão entre as partículas (`a_coh`) e a curvatura pelas normais (`a_curv`). Medido com a tensão contínua também
//     aí: a borda se esgarçava (a barragem com 21–35 partículas soltas contra 15 sem tensão), a gota do PBF se partia
//     ou ficava a 1,12–1,18 de razão conforme a ordem das contas em f32, e o favo de mel da água parada não mudava (na
//     escala do espaçamento a gravidade restaura a superfície ~50× mais que a capilaridade da água).
// Entre a linha de contato e o resto, a passagem é pelo peso.
fn fluid_surface_accel(
    n_i: vec4f,
    sums: vec2f,
    a_coh: vec3f,
    a_curv: vec3f,
    contact: vec4f,
    volume: f32,
    sigma: f32,
    h: f32,
    reach: f32,
    wall_layer: f32,
    adhesion: f32,
) -> vec3f {
    let akinci = a_coh + a_curv;
    if (n_i.w <= 0.0 || contact.w >= reach) { return akinci; }
    if (csf_thin_film(n_i, contact, reach) || !csf_resolved(n_i, sums, volume)) {
        return a_coh + akinci_adhesion_accel(contact, reach, adhesion);
    }
    let line = csf_contact_line(n_i, contact, reach) * (1.0 - smoothstep(wall_layer, reach, contact.w));
    let csf = csf_wall_reaction(csf_accel(n_i, sums, volume, sigma, h), contact, wall_layer);
    return mix(akinci + akinci_adhesion_accel(contact, reach, adhesion), csf, line);
}

// ── Fronteira sólida no SPH (Akinci et al. 2012; a fronteira como meio-espaço, Koschier e Bender 2017) ─────────────
// Integral da spline cúbica sobre o sólido além de um plano a distância com sinal `d` (> 0: a partícula fora) e a
// derivada dela em `d`: B(d) = 2π ∫_{|d|}^{2h} W(r) r (r − |d|) dr (½ em d = 0; 1 − B(−d) dentro do sólido) e
// B'(d) = −2π ∫_{|d|}^{2h} W(r) r dr. Em q = r/h, com σh³ = 1/π: B = 2 ∫ f(q) q (q − δ) dq e B' = −(2/h) ∫ f(q) q dq —
// polinômios de grau ≤ 5 em cada trecho da spline ([δ, 1] e [1, 2]), exatos com Gauss-Legendre de 4 pontos.
// Devolve (B, B').
fn cubic_half_space(d: f32, h: f32) -> vec2f {
    let delta = abs(d) / h;
    if (delta >= 2.0) { return vec2f(select(1.0, 0.0, d >= 0.0), 0.0); }
    let x = array<f32, 4>(-0.8611363115940526, -0.3399810435848563, 0.3399810435848563, 0.8611363115940526);
    let w = array<f32, 4>(0.3478548451374538, 0.6521451548625461, 0.6521451548625461, 0.3478548451374538);
    var vol = 0.0;
    var grad = 0.0;
    // Trecho interno da spline, [δ, 1] (só com δ < 1), e externo, [max(δ, 1), 2].
    for (var seg = 0u; seg < 2u; seg++) {
        let a = select(max(delta, 1.0), delta, seg == 0u);
        let b = select(2.0, 1.0, seg == 0u);
        if (a >= b) { continue; }
        let half = 0.5 * (b - a);
        let mid = 0.5 * (a + b);
        for (var k = 0u; k < 4u; k++) {
            let q = mid + half * x[k];
            let e = 2.0 - q;
            let f = select(0.25 * e * e * e, 1.0 - 1.5 * q * q + 0.75 * q * q * q, seg == 0u);
            vol += w[k] * half * f * q * (q - delta);
            grad += w[k] * half * f * q;
        }
    }
    let inside = 2.0 * vol;
    let slope = -2.0 * grad / h;
    // Dentro do sólido: B(d) = 1 − B(−d); a derivada é a mesma.
    return vec2f(select(1.0 - inside, inside, d >= 0.0), slope);
}

// O mesmo para o poly6 (suporte h; W = 315/(64π h³) (1 − q²)³), em forma fechada: B = (315/32) ∫_δ^1 (1 − q²)³ q (q − δ) dq
// = (315/32) [16/315 − F(δ) − δ (1 − δ²)⁴ / 8], F(q) = q³/3 − 3q⁵/5 + 3q⁷/7 − q⁹/9, e B' = −(315/256h) (1 − δ²)⁴.
// Devolve (B, B').
fn poly6_half_space(d: f32, h: f32) -> vec2f {
    let delta = abs(d) / h;
    if (delta >= 1.0) { return vec2f(select(1.0, 0.0, d >= 0.0), 0.0); }
    let q2 = delta * delta;
    let f = delta * q2 * (1.0 / 3.0 - q2 * (3.0 / 5.0 - q2 * (3.0 / 7.0 - q2 / 9.0)));
    let e = (1.0 - q2) * (1.0 - q2);
    let inside = (315.0 / 32.0) * (16.0 / 315.0 - f - delta * e * e / 8.0);
    let slope = -(315.0 / 256.0) * e * e / h;
    return vec2f(select(1.0 - inside, inside, d >= 0.0), slope);
}
