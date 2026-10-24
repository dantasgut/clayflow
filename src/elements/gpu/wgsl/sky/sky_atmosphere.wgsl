// Atmosfera física (spec 033, R4; Hillaire 2020): o meio a uma altura (Rayleigh, Mie, ozônio), as fases, as distâncias
// às esferas do chão e do topo e a parametrização das tabelas de transmitância (Bruneton), de múltiplo espalhamento e
// da vista do céu. Distâncias em km, planeta na origem, +y para cima. A referência de CPU é
// `elements/scene/reference/atmosphere.ts`.
// Requer: sky.


/** Coeficientes do meio a uma altura `h` (km acima do chão). */
struct SkyMedium {
    scattering: vec3f,
    extinction: vec3f,
    rayleigh: vec3f,
    mie: f32,
}

fn sky_medium(h: f32) -> SkyMedium {
    let dr = exp(-h / sky.rayleigh.w);
    let dm = exp(-h / sky.mie.z);
    let dz = max(0.0, 1.0 - abs(h - sky.ozone.w) / sky.radii.z);
    let rayleigh = sky.rayleigh.xyz * dr;
    let mie = sky.mie.x * dm;
    let mie_ext = sky.mie.y * dm;
    let ozone = sky.ozone.xyz * dz;
    return SkyMedium(rayleigh + vec3f(mie), rayleigh + vec3f(mie_ext) + ozone, rayleigh, mie);
}

fn sky_rayleigh_phase(c: f32) -> f32 {
    return 3.0 / (16.0 * PI) * (1.0 + c * c);
}

/** Fase de Mie de Cornette-Shanks. */
fn sky_mie_phase(c: f32) -> f32 {
    let g = sky.mie.w;
    let k = 3.0 / (8.0 * PI) * (1.0 - g * g) / (2.0 + g * g);
    return k * (1.0 + c * c) / pow(1.0 + g * g - 2.0 * g * c, 1.5);
}

fn sky_bottom() -> f32 { return sky.radii.x; }
fn sky_top() -> f32 { return sky.radii.y; }

/** O raio de raio `r` e cosseno zenital `mu` atinge o chão? */
fn sky_hits_ground(r: f32, mu: f32) -> bool {
    return mu < 0.0 && r * r * (mu * mu - 1.0) + sky_bottom() * sky_bottom() >= 0.0;
}

/** Distância até o topo da atmosfera. */
fn sky_distance_to_top(r: f32, mu: f32) -> f32 {
    let disc = r * r * (mu * mu - 1.0) + sky_top() * sky_top();
    return max(0.0, -r * mu + sqrt(max(disc, 0.0)));
}

/** Distância até o chão (só vale quando atinge). */
fn sky_distance_to_bottom(r: f32, mu: f32) -> f32 {
    let disc = r * r * (mu * mu - 1.0) + sky_bottom() * sky_bottom();
    return max(0.0, -r * mu - sqrt(max(disc, 0.0)));
}

/** Comprimento do segmento dentro da atmosfera (até o topo ou o chão). */
fn sky_segment(r: f32, mu: f32) -> f32 {
    return select(sky_distance_to_top(r, mu), sky_distance_to_bottom(r, mu), sky_hits_ground(r, mu));
}

/** (r, mu) → uv da tabela de transmitância (Bruneton 2017). */
fn sky_transmittance_uv(r: f32, mu: f32) -> vec2f {
    let h = sqrt(sky_top() * sky_top() - sky_bottom() * sky_bottom());
    let rho = sqrt(max(r * r - sky_bottom() * sky_bottom(), 0.0));
    let d = sky_distance_to_top(r, mu);
    let d_min = sky_top() - r;
    let d_max = rho + h;
    return vec2f((d - d_min) / max(d_max - d_min, 1e-6), rho / h);
}

/** uv → (r, mu) da tabela de transmitância. */
fn sky_transmittance_params(uv: vec2f) -> vec2f {
    let h = sqrt(sky_top() * sky_top() - sky_bottom() * sky_bottom());
    let rho = h * uv.y;
    let r = sqrt(rho * rho + sky_bottom() * sky_bottom());
    let d_min = sky_top() - r;
    let d_max = rho + h;
    let d = d_min + uv.x * (d_max - d_min);
    let mu = select(clamp((h * h - rho * rho - d * d) / (2.0 * r * d), -1.0, 1.0), 1.0, d <= 0.0);
    return vec2f(r, mu);
}

/** Ângulos da vista do céu (Hillaire 2020, §5.3): uv → (zênite da vista, azimute em relação ao sol). */
fn sky_view_angles(uv: vec2f, r: f32) -> vec2f {
    let beta = acos(clamp(sqrt(max(r * r - sky_bottom() * sky_bottom(), 0.0)) / r, -1.0, 1.0));
    let zenith_horizon = PI - beta;
    var zenith: f32;
    if (uv.y < 0.5) {
        var c = 1.0 - 2.0 * uv.y;
        c = 1.0 - c * c;
        zenith = zenith_horizon * c;
    } else {
        let c = uv.y * 2.0 - 1.0;
        zenith = zenith_horizon + beta * c * c;
    }
    return vec2f(zenith, uv.x * uv.x * PI);
}

/** Inverso de `sky_view_angles`. */
fn sky_view_uv(zenith: f32, azimuth: f32, r: f32) -> vec2f {
    let beta = acos(clamp(sqrt(max(r * r - sky_bottom() * sky_bottom(), 0.0)) / r, -1.0, 1.0));
    let zenith_horizon = PI - beta;
    var v: f32;
    if (zenith < zenith_horizon) {
        let c = sqrt(max(1.0 - zenith / zenith_horizon, 0.0));
        v = (1.0 - c) * 0.5;
    } else {
        v = sqrt(clamp((zenith - zenith_horizon) / beta, 0.0, 1.0)) * 0.5 + 0.5;
    }
    return vec2f(sqrt(clamp(azimuth / PI, 0.0, 1.0)), v);
}

/** Raio do observador (km do centro do planeta) para um ponto da cena em metros. */
fn sky_radius_at(p: vec3f) -> f32 {
    return sky_bottom() + max(sky.radii.w + p.y * 0.001, 0.001);
}
