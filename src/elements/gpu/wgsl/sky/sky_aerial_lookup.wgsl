// Leitura da perspectiva aérea (spec 041, R10): a luz espalhada (por unidade de iluminância do sol) e a transmitância
// da câmera até a distância `d` (m) na direção de tela `uv` — a tabela 32³ até `SKY_AERIAL_RANGE` km (interpolada na
// fatia pela raiz da distância; antes da primeira fatia, linear desde (0, 1)); além, o trecho que falta pela razão das
// transmitâncias até o topo (exata numa atmosfera esférica) e a luz dele pela fonte uniforme no trecho
// (`S∞ − S_D`)·(1 − T)/(1 − T∞), com `S∞` a vista do céu. `sky_aerial_far` faz o mesmo sem a tabela (para as direções
// fora da tela: o panorama das nuvens).
// Requer: SKY_AERIAL_RANGE, sky_atmosphere, sky_lookup, sky, sky_view_lut, sky_aerial_lut, sky_aerial_transmittance_lut, sky_sampler.

struct SkyAerial {
    scattered: vec3f,
    transmittance: vec3f,
}

/** Transmitância da atmosfera entre a câmera (raio `r0`) e o ponto a `d` km na direção de cosseno zenital `mu`. */
fn sky_segment_transmittance(r0: f32, mu: f32, d: f32) -> vec3f {
    let r1 = sqrt(max(r0 * r0 + d * d + 2.0 * r0 * mu * d, 1e-6));
    let mu1 = clamp((r0 * mu + d) / r1, -1.0, 1.0);
    // Para cima: T(r0)/T(r1) até o topo. Para baixo: o caminho ao contrário (Bruneton), que não atinge o chão.
    if (mu >= 0.0) {
        return sky_transmittance(r0, mu) / max(sky_transmittance(r1, mu1), vec3f(1e-12));
    }
    return sky_transmittance(r1, -mu1) / max(sky_transmittance(r0, -mu), vec3f(1e-12));
}

/** A luz do céu (por unidade de sol) na direção `dir` e a transmitância até o topo, vistas do observador. */
fn sky_aerial_far(dir: vec3f, start_km: f32, start: SkyAerial, d_km: f32) -> SkyAerial {
    let r0 = sky_bottom() + max(sky.radii.w, 0.001);
    let mu = clamp(dir.y, -1.0, 1.0);
    let seg = sky_segment(r0, mu);
    let a = min(start_km, seg);
    let b = min(d_km, seg);
    if (b <= a) { return start; }
    let t_rest = sky_segment_transmittance(sky_bottom() + max(sky.radii.w, 0.001), mu, b)
        / max(sky_segment_transmittance(sky_bottom() + max(sky.radii.w, 0.001), mu, a), vec3f(1e-12));
    let t_inf = sky_segment_transmittance(r0, mu, seg) / max(sky_segment_transmittance(r0, mu, a), vec3f(1e-12));
    let zenith = acos(mu);
    let sun = sky.sunDirection.xyz;
    let la = length(dir.xz);
    let lb = length(sun.xz);
    let cos_az = select(1.0, dot(dir.xz, sun.xz) / (la * lb), la > 1e-6 && lb > 1e-6);
    let s_inf = textureSampleLevel(sky_view_lut, sky_sampler, sky_view_uv(zenith, acos(clamp(cos_az, -1.0, 1.0)), r0), 0.0).rgb;
    let rest = max(s_inf - start.scattered, vec3f(0.0)) / max(start.transmittance, vec3f(1e-6));
    let frac = (1.0 - t_rest) / max(1.0 - t_inf, vec3f(1e-6));
    return SkyAerial(start.scattered + start.transmittance * rest * clamp(frac, vec3f(0.0), vec3f(1.0)),
        start.transmittance * t_rest);
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
