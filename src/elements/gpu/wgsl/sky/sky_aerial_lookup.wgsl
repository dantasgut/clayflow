// Leitura da perspectiva aérea (spec 041, R10): a luz espalhada (por unidade de iluminância do sol) e a transmitância
// da câmera até a distância `d` (m) na direção de tela `uv` — a tabela 32³ até `SKY_AERIAL_RANGE` km (interpolada na
// fatia pela raiz da distância; antes da primeira fatia, linear desde (0, 1)); além, o trecho que falta integrado como
// a tabela (`sky_aerial_far`, que também serve sem a tabela às direções fora da tela: o panorama das nuvens).
// O trecho além da tabela multiplica a luz simples por `sky_aerial_far_visibility(dir, t_km)` (pronta, 1; nas nuvens, a
// sombra delas pelo mapa visto do sol).
// Requer: SKY_AERIAL_RANGE, sky_atmosphere, sky_lookup, sky, sky_view_lut, sky_aerial_lut, sky_aerial_transmittance_lut, sky_sampler,
// sky_aerial_far_visibility.

struct SkyAerial {
    scattered: vec3f,
    transmittance: vec3f,
}

/** Passos da marcha do trecho além da tabela (teto constante). */
const SKY_AERIAL_FAR_STEPS: u32 = 32u;

/**
 * O trecho de `start_km` a `d_km` na direção `dir` (mundo), continuando `start` (a luz e a transmitância até
 * `start_km`): a mesma integral da tabela (simples de Rayleigh e Mie com a transmitância do sol mais Ψms) em
 * `SKY_AERIAL_FAR_STEPS` passos. A aproximação anterior (a fonte uniforme no resto do caminho até o topo, pela razão das
 * transmitâncias) errava 10 % a luz das nuvens a 100 km rente ao horizonte na direção do sol baixo (smoke `clouds`,
 * `sunset`): o caminho sobe e a luz do sol que chega a ele muda ao longo dele.
 */
fn sky_aerial_far(dir: vec3f, start_km: f32, start: SkyAerial, d_km: f32) -> SkyAerial {
    let r0 = sky_bottom() + max(sky.radii.w, 0.001);
    let mu = clamp(dir.y, -1.0, 1.0);
    let seg = sky_segment(r0, mu);
    let a = min(start_km, seg);
    let b = min(d_km, seg);
    if (b <= a) { return start; }
    // O sol no plano x-y e a direção com o mesmo azimute relativo (como a tabela).
    let sun_cos = clamp(sky.sunDirection.y, -1.0, 1.0);
    let sun = vec3f(sqrt(max(0.0, 1.0 - sun_cos * sun_cos)), sun_cos, 0.0);
    let h = length(dir.xz);
    let lb = length(sky.sunDirection.xz);
    let cos_az = select(1.0, dot(dir.xz, sky.sunDirection.xz) / (h * lb), h > 1e-6 && lb > 1e-6);
    let v = vec3f(h * cos_az, mu, h * sqrt(max(0.0, 1.0 - cos_az * cos_az)));
    let c = dot(v, sun);
    let pr = sky_rayleigh_phase(c);
    let pm = sky_mie_phase(c);
    let pos = vec3f(0.0, r0, 0.0);
    var lum = start.scattered;
    var throughput = start.transmittance;
    let dt = (b - a) / f32(SKY_AERIAL_FAR_STEPS);
    for (var k = 0u; k < SKY_AERIAL_FAR_STEPS; k++) {
        let x = pos + v * (a + (f32(k) + 0.5) * dt);
        let rx = length(x);
        let m = sky_medium(rx - sky_bottom());
        let step_t = exp(-m.extinction * dt);
        let integ = select(vec3f(dt), (1.0 - step_t) / max(m.extinction, vec3f(1e-12)), m.extinction > vec3f(0.0));
        let mu_s = dot(x, sun) / rx;
        // A luz simples × a visibilidade do sol ali (a sombra das nuvens no ar, como na tabela; pronta, 1).
        let vis = sky_aerial_far_visibility(dir, a + (f32(k) + 0.5) * dt);
        let single = (m.rayleigh * pr + vec3f(m.mie * pm)) * sky_transmittance(rx, mu_s) * vis;
        let multi = m.scattering * sky_multiscatter(rx, mu_s);
        lum += throughput * (single + multi) * integ;
        throughput *= step_t;
    }
    return SkyAerial(lum, throughput);
}

/** A perspectiva aérea até `d` metros pela coluna `uv` da tela, na direção `dir` (mundo). */
fn sky_aerial(uv: vec2f, dir: vec3f, d: f32) -> SkyAerial {
    let d_km = d * 0.001;
    let n = f32(textureDimensions(sky_aerial_lut).z);
    let first = SKY_AERIAL_RANGE / (n * n);
    let s = sqrt(min(d_km, SKY_AERIAL_RANGE) / SKY_AERIAL_RANGE) * n - 1.0;
    let w = (max(s, 0.0) + 0.5) / n;
    let at = vec3f(uv, w);
    var out = SkyAerial(
        textureSampleLevel(sky_aerial_lut, sky_sampler, at, 0.0).rgb,
        textureSampleLevel(sky_aerial_transmittance_lut, sky_sampler, at, 0.0).rgb,
    );
    if (d_km < first) {
        let k = d_km / first;
        out = SkyAerial(out.scattered * k, mix(vec3f(1.0), out.transmittance, k));
    }
    if (d_km > SKY_AERIAL_RANGE) { out = sky_aerial_far(dir, SKY_AERIAL_RANGE, out, d_km); }
    return out;
}
