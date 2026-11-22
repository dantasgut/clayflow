// A luz do sol que chega a um ponto da camada de nuvens (spec 041): a transmitância da atmosfera do topo até ele.
// Requer: cloud_common, sky_query, clouds.

/** Transmitância da atmosfera do topo até o ponto `p` na direção do sol (pela altitude na casca do planeta). */
fn cloud_sun_atmosphere(p: vec3f) -> vec3f {
    let up = normalize(vec3f(p.x, p.y + clouds.shell.x, p.z));
    let r = sky_bottom() + max(sky.radii.w + cloud_altitude(p) * 0.001, 0.001);
    return sky_transmittance(r, clamp(dot(up, sky.sunDirection.xyz), -1.0, 1.0));
}
