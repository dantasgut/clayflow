// Consulta do céu físico (spec 033, R4): a radiância do céu numa direção de mundo (+y para cima) pela tabela da vista do
// céu × a iluminância do sol, com o piso noturno; a transmitância do sol até um ponto da cena (a cor física do sol no
// chão); e o fundo visível com o disco do sol. Fonte dos raios que escapam da iluminação global e o fundo da cena.
// Requer: sky_atmosphere, sky_lookup, sky, sky_view_lut, sky_sampler.

/** Radiância do céu (sem o disco do sol) vinda da direção `dir` (unitária, mundo). */
fn sky_radiance(dir: vec3f) -> vec3f {
    let r = sky_bottom() + max(sky.radii.w, 0.001);
    let zenith = acos(clamp(dir.y, -1.0, 1.0));
    let sun = sky.sunDirection.xyz;
    let a = dir.xz;
    let b = sun.xz;
    let la = length(a);
    let lb = length(b);
    // Azimute relativo ao sol (simétrico): o do sol no zênite ou da vista no zênite é indiferente.
    let cos_az = select(1.0, dot(a, b) / (la * lb), la > 1e-6 && lb > 1e-6);
    let azimuth = acos(clamp(cos_az, -1.0, 1.0));
    let uv = sky_view_uv(zenith, azimuth, r);
    let lum = textureSampleLevel(sky_view_lut, sky_sampler, uv, 0.0).rgb;
    return lum * sky.sunIlluminance.rgb + sky.night.rgb;
}

/** Transmitância da atmosfera do topo até o ponto `p` (metros da cena) na direção do sol. */
fn sky_sun_transmittance(p: vec3f) -> vec3f {
    return sky_transmittance(sky_radius_at(p), clamp(sky.sunDirection.y, -1.0, 1.0));
}

/** Fundo visível: o céu e, dentro do raio angular do sol, o disco atenuado pela atmosfera. */
fn sky_background(dir: vec3f) -> vec3f {
    var l = sky_radiance(dir);
    let radius = sky.sunIlluminance.w;
    if (sky.sunDisk != 0u && dot(dir, sky.sunDirection.xyz) > cos(radius)) {
        let solid = SKY_PI * radius * radius;
        l += sky.sunIlluminance.rgb * sky_sun_transmittance(vec3f(0.0)) / solid;
    }
    return l;
}
