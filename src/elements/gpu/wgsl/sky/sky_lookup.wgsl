// Leitura das tabelas da atmosfera (spec 033, R4): transmitância até o topo e múltiplo espalhamento (Ψms) por raio e
// cosseno zenital do sol. Usada pela geração das tabelas seguintes e pela consulta do céu.
// Requer: sky_atmosphere, sky, sky_transmittance_lut, sky_multiscatter_lut, sky_sampler.

/** Transmitância de (r, mu) até o topo; 0 se o raio atinge o chão. */
fn sky_transmittance(r: f32, mu: f32) -> vec3f {
    if (sky_hits_ground(r, mu)) { return vec3f(0.0); }
    return textureSampleLevel(sky_transmittance_lut, sky_sampler, sky_transmittance_uv(r, mu), 0.0).rgb;
}

/** Ψms (por unidade de iluminância do sol) a raio `r` com o sol a cosseno zenital `mu_s`. */
fn sky_multiscatter(r: f32, mu_s: f32) -> vec3f {
    let uv = vec2f(mu_s * 0.5 + 0.5, clamp((r - sky_bottom()) / (sky_top() - sky_bottom()), 0.0, 1.0));
    return textureSampleLevel(sky_multiscatter_lut, sky_sampler, uv, 0.0).rgb;
}
