// Espalhamento sob a superfície (spec 011, T113): o perfil de difusão normalizado de Christensen e Burley 2015
// ("Approximate Reflectance Profiles for Efficient Subsurface Scattering") — R(r) = A (e^(−r/d) + e^(−r/3d)) / (8π d r),
// com d = ℓ/s, ℓ o caminho livre médio do espalhamento e s o fator de forma do albedo da superfície A para a luz que
// entra difusa (eq. 6: s = 1,9 − A + 3,5 (A − 0,8)²). O espelho f64 e a conferência contra o passeio aleatório estão em
// `material/reference/subsurface.ts`.
// Requer: closure.

// Albedo mínimo com que a luz que atravessa é guardada junto da que entra pela frente (a saída multiplica pelo albedo).
const SUBSURFACE_MIN_ALBEDO: f32 = 0.02;

// Fator de forma `s` por canal para o albedo da superfície `albedo`.
fn subsurface_shape(albedo: vec3f) -> vec3f {
    let a = clamp(albedo, vec3f(0.0), vec3f(1.0));
    return vec3f(1.9) - a + 3.5 * (a - vec3f(0.8)) * (a - vec3f(0.8));
}

// Comprimento do perfil por canal em unidades do mundo: d = ℓ/s, com o caminho livre médio do fechamento em mm levado
// à cena pela escala do mundo (unidades por metro). 0: o canal não espalha.
fn subsurface_length(c: Closure) -> vec3f {
    return c.subsurface_radius * (1e-3 * c.subsurface_scale) / subsurface_shape(c.subsurface_color);
}

// Densidade radial normalizada do perfil de comprimento `d` (> 0) no raio `r`: 2π r R(r) / A.
fn subsurface_radial_pdf(r: f32, d: f32) -> f32 {
    return (exp(-r / d) + exp(-r / (3.0 * d))) / (4.0 * d);
}

// A mesma por canal; o canal de comprimento 0 fica em 0 (não recebe dos vizinhos).
fn subsurface_radial_pdf3(r: f32, d: vec3f) -> vec3f {
    let s = max(d, vec3f(1e-12));
    return select(vec3f(0.0), (exp(-vec3f(r) / s) + exp(-vec3f(r) / (3.0 * s))) / (4.0 * s), d > vec3f(0.0));
}

// Raio de fração acumulada `u` em [0, 1) do perfil de comprimento `d`: a inversa exata — com y = e^(−r/3d),
// ¼ y³ + ¾ y = 1 − u é a cúbica y³ + 3y − 4(1 − u) = 0, de raiz real y = c − 1/c, c = ∛(2(1 − u) + √(4(1 − u)² + 1)).
fn subsurface_sample(u: f32, d: f32) -> f32 {
    let v = clamp(1.0 - u, 1e-6, 1.0);
    let c = pow(2.0 * v + sqrt(4.0 * v * v + 1.0), 1.0 / 3.0);
    return -3.0 * d * log(clamp(c - 1.0 / c, 1e-6, 1.0));
}

// Transmissão difusa por uma espessura `t` (unidades do mundo) por canal: a parte do perfil além de `t`,
// ¼ e^(−t/d) + ¾ e^(−t/3d) — 1 em t = 0; o canal de comprimento 0 não transmite.
fn subsurface_transmission(t: f32, d: vec3f) -> vec3f {
    let s = max(d, vec3f(1e-12));
    let x = vec3f(max(t, 0.0));
    return select(vec3f(0.0), 0.25 * exp(-x / s) + 0.75 * exp(-x / (3.0 * s)), d > vec3f(0.0));
}
