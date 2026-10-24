// Amostragem (spec 037, R2): de números uniformes `u` em [0, 1)² a direções e pesos, no referencial local (z = eixo).
// Requer: constants.

// Hemisfério por cosseno (Malley): densidade cos θ / π.
fn sample_cosine(u: vec2f) -> vec3f {
    let r = sqrt(u.x);
    let phi = TAU * u.y;
    return vec3f(r * cos(phi), r * sin(phi), sqrt(max(0.0, 1.0 - u.x)));
}

// Esfera uniforme: z = 2u.x − 1, φ = 2π u.y.
fn sample_sphere(u: vec2f) -> vec3f {
    let z = u.x * 2.0 - 1.0;
    let phi = TAU * u.y;
    let s = sqrt(max(0.0, 1.0 - z * z));
    return vec3f(s * cos(phi), s * sin(phi), z);
}

// Cone uniforme em volta de z com o cosseno do meio-ângulo `cos_max`.
fn sample_cone(u: vec2f, cos_max: f32) -> vec3f {
    let ct = 1.0 - u.x * (1.0 - cos_max);
    let st = sqrt(max(1.0 - ct * ct, 0.0));
    let phi = TAU * u.y;
    return vec3f(st * cos(phi), st * sin(phi), ct);
}

// Triângulo uniforme: as baricêntricas (s = √u.x).
fn sample_triangle(u: vec2f) -> vec3f {
    let s = sqrt(u.x);
    return vec3f(1.0 - s, s * (1.0 - u.y), s * u.y);
}
