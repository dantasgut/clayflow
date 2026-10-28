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

// Gradiente Spiky ∇W(r, h): não nulo em r=0; bom para pressão
fn grad_W_spiky(r_vec: vec3f, r: f32, h: f32) -> vec3f {
    if (r <= 0.0001 || r >= h) { return vec3f(0.0); }
    // -45 / (PI * h^6) * (h - r)^2 / r * r_vec
    let coeff = -45.0 / (PI * pow(h, 6.0));
    let d = h - r;
    return coeff * (d * d / r) * r_vec;
}

// ── Tensão superficial e adesão (Akinci, Akinci e Teschner 2013; spec 030) ──────────────────────────────────────────
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

// Aceleração de tensão superficial de i por j: coesão (−γ mⱼ C(r) r̂) + curvatura (−γ (nᵢ − nⱼ)), com a correção
// Kᵢⱼ = 2ρ₀ / (ρᵢ + ρⱼ) que reforça a borda (menos vizinhos) sem aglomerar — limitada a 2 (ρᵢ + ρⱼ ≥ ρ₀): entre
// partículas soltas a densidade cai à auto-contribuição e o fator sem limite as arremessaria. `xij` = xᵢ − xⱼ, r > 0.
fn akinci_pair_accel(
    xij: vec3f,
    r: f32,
    H: f32,
    gamma: f32,
    mass_j: f32,
    rho0: f32,
    rho_i: f32,
    rho_j: f32,
    n_i: vec3f,
    n_j: vec3f,
) -> vec3f {
    let k_ij = 2.0 * rho0 / max(rho_i + rho_j, rho0);
    let cohesion = -gamma * mass_j * akinci_cohesion(r, H) * (xij / r);
    let curvature = -gamma * (n_i - n_j);
    return k_ij * (cohesion + curvature);
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
