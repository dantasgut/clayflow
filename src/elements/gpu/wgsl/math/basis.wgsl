// Bases ortonormais (spec 037, R2): as colunas (t, b, n) de um referencial em volta de `n`.

// Duff et al. (2017), sem ramos nem normalização: contínua exceto em n.z = −1.
fn basis_duff(n: vec3f) -> mat3x3f {
    let s = select(-1.0, 1.0, n.z >= 0.0);
    let a = -1.0 / (s + n.z);
    let b = n.x * n.y * a;
    return mat3x3f(vec3f(1.0 + s * n.x * n.x * a, s * b, -s * n.x), vec3f(b, s + n.y * n.y * a, -n.y), n);
}

// Pelo produto vetorial com um eixo auxiliar (`helper`, que quem chama escolhe longe de `n` — a escolha e o limiar
// ficam com cada uso): t = normalize(helper × n), b = n × t.
fn basis_cross(n: vec3f, helper: vec3f) -> mat3x3f {
    let t = normalize(cross(helper, n));
    return mat3x3f(t, cross(n, t), n);
}
