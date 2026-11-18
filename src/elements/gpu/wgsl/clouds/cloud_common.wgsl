// Nuvens volumétricas (spec 041): a casca entre a base e o topo da camada sobre o planeta do `Sky` (centro em
// (0, −R, 0), R = raio do chão da cena em metros), a altitude e a fração de altura de um ponto, o remapeamento e o
// perfil de altura por tipo (R5). Espelho de `elements/media/clouds/reference/cloudModel.ts`.
// Requer: clouds.

/** O intervalo [l0, h0] levado a [l1, h1], sem saturar. */
fn cloud_remap(v: f32, l0: f32, h0: f32, l1: f32, h1: f32) -> f32 {
    return l1 + (v - l0) * (h1 - l1) / (h0 - l0);
}

/** Altitude (m acima do chão da cena) do ponto `p`. */
fn cloud_altitude(p: vec3f) -> f32 {
    let r = clouds.shell.x;
    return length(vec3f(p.x, p.y + r, p.z)) - r;
}

/** Fração de altura na camada (fora de [0, 1] fora dela). */
fn cloud_height_fraction(p: vec3f) -> f32 {
    return (cloud_altitude(p) - clouds.shell.y) / max(clouds.shell.w, 1e-3);
}

/** Interseção com a esfera de raio `radius` (m do centro do planeta): (t0, t1), ou (1, −1) sem interseção. */
fn cloud_sphere(o: vec3f, d: vec3f, radius: f32) -> vec2f {
    let oc = vec3f(o.x, o.y + clouds.shell.x, o.z);
    let b = dot(oc, d);
    let c = dot(oc, oc) - radius * radius;
    let disc = b * b - c;
    if (disc < 0.0) { return vec2f(1.0, -1.0); }
    let s = sqrt(disc);
    return vec2f(-b - s, -b + s);
}

/**
 * Os trechos do raio dentro da casca até `t_max` e até o chão do planeta: `xy` o primeiro, `zw` o segundo (vazio quando
 * `z ≥ w`). Precisão: as distâncias ao centro do planeta (≈ 6,4·10⁶ m) em f32 erram ~0,5 m, abaixo do passo da marcha.
 */
fn cloud_shell_segments(o: vec3f, d: vec3f, t_max: f32) -> vec4f {
    let r = clouds.shell.x;
    let outer = cloud_sphere(o, d, r + clouds.shell.z);
    if (outer.x > outer.y) { return vec4f(0.0, 0.0, 0.0, 0.0); }
    let inner = cloud_sphere(o, d, r + clouds.shell.y);
    let ground = cloud_sphere(o, d, r);
    var end = t_max;
    if (ground.x <= ground.y && ground.x > 0.0) { end = min(end, ground.x); }
    let a = max(0.0, outer.x);
    let b = min(end, outer.y);
    if (b <= a) { return vec4f(0.0, 0.0, 0.0, 0.0); }
    if (inner.x > inner.y || inner.y <= a || inner.x >= b) { return vec4f(a, b, 0.0, 0.0); }
    var s0 = vec2f(0.0);
    var s1 = vec2f(0.0);
    if (inner.x > a) { s0 = vec2f(a, min(inner.x, b)); }
    if (inner.y < b) {
        let seg = vec2f(max(inner.y, a), b);
        if (s0.y > s0.x) { s1 = seg; } else { s0 = seg; }
    }
    return vec4f(s0, s1);
}

/**
 * A distância (m), na direção `sun` (para o sol), do ponto `q` até a saída do topo da casca do lado do sol: a origem do
 * raio que desce do sol pela coluna de `q` no mapa visto do sol, com o sol acima ou abaixo do horizonte. 0 quando a
 * coluna não cruza o topo da casca ou o cruza só do outro lado.
 */
fn cloud_sun_entry(q: vec3f, sun: vec3f) -> f32 {
    let s = cloud_sphere(q, sun, clouds.shell.x + clouds.shell.z);
    if (s.x > s.y) { return 0.0; }
    return max(s.y, 0.0) + 1.0;
}

/** Limites [subida0, subida1, descida0, descida1] do perfil no tipo `t` (estrato 0 → cúmulo 0,5 → cúmulo-nimbo 1). */
fn cloud_profile_limits(t: f32) -> vec4f {
    let stratus = vec4f(0.0, 0.1, 0.2, 0.3);
    let cumulus = vec4f(0.0, 0.25, 0.6, 0.95);
    let nimbus = vec4f(0.0, 0.1, 0.8, 1.0);
    let tt = clamp(t, 0.0, 1.0);
    if (tt <= 0.5) { return mix(stratus, cumulus, tt * 2.0); }
    return mix(cumulus, nimbus, tt * 2.0 - 1.0);
}

/** O perfil de altura: a rampa de subida na base × a de descida no topo. */
fn cloud_height_profile(h: f32, t: f32) -> f32 {
    if (h < 0.0 || h > 1.0) { return 0.0; }
    let l = cloud_profile_limits(t);
    return smoothstep(l.x, l.y, h) * (1.0 - smoothstep(l.z, l.w, h));
}

/**
 * O expoente da cobertura na bigorna do cúmulo-nimbo (spec 041, R19; o `anvil bias` do Nubis, Schneider 2017): perto do
 * topo da torre (fração de altura local 0,65–0,85) a cobertura sobe como `c^e`, e = 1 − 0,6·a, `a` a força pelo tipo
 * (só o cúmulo-nimbo maduro, tipo 0,9–1). 1 sem bigorna. Espelho de `anvilExponent` em `cloudModel.ts`.
 */
fn cloud_anvil_exponent(h: f32, t: f32) -> f32 {
    return 1.0 - 0.6 * smoothstep(0.9, 1.0, t) * smoothstep(0.65, 0.85, h);
}
