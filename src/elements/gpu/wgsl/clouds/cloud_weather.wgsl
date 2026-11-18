// O tempo das nuvens (spec 041, R18): as derivadas do campo de pressão pelo estêncil de 9 pontos, o vento equilibrado
// com a pressão (o vento gradiente com atrito linear: geostrófico, gradiente, ciclostrófico e antitríptico como
// limites), a velocidade vertical no topo da camada limite pela convergência do vento com atrito (Ekman), o parâmetro de
// Okubo–Weiss (a frente: onde os sistemas se encontram) e o mapeamento para a cobertura, o tipo e o topo das nuvens.
// Leste = +x, norte = −z. Espelho de `reference/cloudWeather.ts`.
// Requer: clouds, cloud_pressure_fn_at.

/** Densidade do ar na camada limite (kg/m³) e a espessura dela (m). */
const CLOUD_AIR_DENSITY: f32 = 1.2;
const CLOUD_BOUNDARY_LAYER: f32 = 1000.0;
/** Velocidades verticais (m/s) da subida e da subsidência plenas no mapeamento. */
const CLOUD_WEATHER_LIFT: f32 = 0.02;
const CLOUD_WEATHER_SINK: f32 = 0.01;
/** Faixa de √max(W, 0)/f_e (Okubo–Weiss) em que a frente acende. */
const CLOUD_WEATHER_FRONT_LO: f32 = 0.45;
const CLOUD_WEATHER_FRONT_HI: f32 = 0.75;
/** Teto constante da raiz do vento: varredura e bisseção. */
const CLOUD_WIND_SCAN: u32 = 16u;
const CLOUD_WIND_BISECT: u32 = 24u;

/** A pressão e as derivadas em (leste, norte). */
struct CloudPressureDerivatives {
    p: f32,
    pe: f32,
    pn: f32,
    pee: f32,
    pen: f32,
    pnn: f32,
}

/** A pressão da função no ponto (não finita vale 0). */
fn cloud_pressure_sample(xz: vec2f, time: f32, slot: u32) -> f32 {
    let v = cloud_pressure_fn_at(xz, time, slot);
    return select(0.0, v, v == v && abs(v) < 1e30);
}

/** As derivadas pelo estêncil de 9 pontos de lado `h` (m) em (x, z), levadas a (leste, norte) = (x, −z). */
fn cloud_pressure_stencil(xz: vec2f, time: f32, h: f32, slot: u32) -> CloudPressureDerivatives {
    let p = cloud_pressure_sample(xz, time, slot);
    let px0 = cloud_pressure_sample(xz + vec2f(h, 0.0), time, slot);
    let px1 = cloud_pressure_sample(xz - vec2f(h, 0.0), time, slot);
    let pz0 = cloud_pressure_sample(xz + vec2f(0.0, h), time, slot);
    let pz1 = cloud_pressure_sample(xz - vec2f(0.0, h), time, slot);
    let pa = cloud_pressure_sample(xz + vec2f(h, h), time, slot);
    let pb = cloud_pressure_sample(xz - vec2f(h, h), time, slot);
    let pc = cloud_pressure_sample(xz + vec2f(h, -h), time, slot);
    let pd = cloud_pressure_sample(xz + vec2f(-h, h), time, slot);
    let px = (px0 - px1) / (2.0 * h);
    let pz = (pz0 - pz1) / (2.0 * h);
    let pxx = (px0 - 2.0 * p + px1) / (h * h);
    let pzz = (pz0 - 2.0 * p + pz1) / (h * h);
    let pxz = (pa + pb - pc - pd) / (4.0 * h * h);
    return CloudPressureDerivatives(p, px, -pz, pxx, -pxz, pzz);
}

/** A curvatura das isóbaras (1/m), positiva no sentido anti-horário em volta da baixa. */
fn cloud_isobar_curvature(d: CloudPressureDerivatives) -> f32 {
    let g2 = d.pe * d.pe + d.pn * d.pn;
    if (g2 <= 1e-18) { return 0.0; }
    return (d.pnn * d.pe * d.pe - 2.0 * d.pen * d.pe * d.pn + d.pee * d.pn * d.pn) / (g2 * sqrt(g2));
}

/** φ(u) = u (r² + a²) − |G|·a, a = F + κ·u: o equilíbrio ao longo das isóbaras no referencial f > 0. */
fn cloud_wind_phi(u: f32, g: f32, f: f32, kappa: f32, r: f32) -> f32 {
    let a = f + kappa * u;
    return u * (r * r + a * a) - g * a;
}

/**
 * O vento equilibrado (m/s, leste e norte): `U = G/(r + i·a)`, a = f + κ_e·u_t, u_t a raiz regular de
 * `u_t (r² + a²) = |G|·a` (a menor no referencial f > 0, por varredura e bisseção de teto constante; sem raiz regular no
 * anticiclone, o teto do vento gradiente), κ_e = κ·f²/(f² + r²). Ver `balancedWind` na referência.
 */
fn cloud_balanced_wind(d: CloudPressureDerivatives, f: f32, r: f32) -> vec2f {
    let grad = sqrt(d.pe * d.pe + d.pn * d.pn);
    if (grad < 1e-9) { return vec2f(0.0); }
    let g = grad / CLOUD_AIR_DENSITY;
    let kappa = cloud_isobar_curvature(d) * (f * f / (f * f + r * r));
    let ff = abs(f);
    var hi = g / (2.0 * r);
    var capped = -1.0;
    if (ff > 0.0) {
        if (kappa >= 0.0) {
            hi = min(hi, g / ff);
        } else {
            hi = min(hi, 2.0 * g / ff);
            if (cloud_wind_phi(hi, g, ff, kappa, r) < 0.0) { capped = min(ff / (-2.0 * kappa), hi); }
        }
    }
    var lo = 0.0;
    var top = hi;
    for (var k = 1u; k <= CLOUD_WIND_SCAN; k++) {
        let u = hi * f32(k) / f32(CLOUD_WIND_SCAN);
        if (cloud_wind_phi(u, g, ff, kappa, r) >= 0.0) {
            top = u;
            break;
        }
        lo = u;
    }
    for (var k = 0u; k < CLOUD_WIND_BISECT; k++) {
        let m = 0.5 * (lo + top);
        if (cloud_wind_phi(m, g, ff, kappa, r) >= 0.0) { top = m; } else { lo = m; }
    }
    var u = 0.0;
    if (ff > 0.0) { u = select(0.5 * (lo + top), capped, capped >= 0.0); }
    let along = sign(f) * u;
    let a = f + kappa * along;
    let across = g * r / (r * r + a * a);
    let ge = d.pe / grad;
    let gn = d.pn / grad;
    return vec2f(-along * gn - across * ge, along * ge - across * gn);
}

/** A velocidade vertical (m/s) no topo da camada limite: `H·r·∇²p/(ρ(r² + f²))` (Ekman; > 0 nas baixas). */
fn cloud_ekman(d: CloudPressureDerivatives, f: f32, r: f32) -> f32 {
    return CLOUD_BOUNDARY_LAYER * r * (d.pee + d.pnn) / (CLOUD_AIR_DENSITY * (r * r + f * f));
}

/** A frente em [0, 1]: Okubo–Weiss do vento de Guldberg–Mohn, √max(W, 0)/f_e na faixa da frente. */
fn cloud_front(d: CloudPressureDerivatives, f: f32, r: f32) -> f32 {
    let c = 1.0 / (CLOUD_AIR_DENSITY * (r * r + f * f));
    let sn = -c * (r * (d.pee - d.pnn) + 2.0 * f * d.pen);
    let ss = -c * (2.0 * r * d.pen + f * (d.pnn - d.pee));
    let zeta = c * f * (d.pee + d.pnn);
    let w = sn * sn + ss * ss - zeta * zeta;
    return smoothstep(CLOUD_WEATHER_FRONT_LO, CLOUD_WEATHER_FRONT_HI, sqrt(max(w, 0.0)) / sqrt(f * f + r * r));
}

/**
 * Do tempo às nuvens: (cobertura pedida, tipo, fração de altura do topo na casca) pela subida `w`, pela frente e pelo
 * tempo bom `fair` (cobertura, tipo, topo). Ver `weatherClouds` na referência.
 */
fn cloud_weather_clouds(w: f32, front: f32, fair: vec3f) -> vec3f {
    let lift = smoothstep(0.0, CLOUD_WEATHER_LIFT, w);
    let sink = smoothstep(0.0, CLOUD_WEATHER_SINK, -w);
    var c = mix(mix(fair.x, 0.25 * fair.x, sink), max(fair.x, 0.75), lift);
    var t = mix(mix(fair.y, min(fair.y, 0.25), sink), 1.0, lift);
    var z = mix(mix(fair.z, 0.6 * fair.z, sink), 1.0, lift);
    // A frente só onde o ar não desce (a faixa frontal é de convergência).
    let band = front * (1.0 - sink);
    c = mix(c, max(c, 0.85), band);
    t = mix(t, 0.3, band * (1.0 - lift));
    z = mix(z, max(z, 0.55), band);
    return clamp(vec3f(c, t, z), vec3f(0.0), vec3f(1.0));
}
