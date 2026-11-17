// O que as nuvens tapam do céu numa direção (spec 041, R12): o panorama da câmera — luz espalhada (rgb) e
// transmitância (a), composição "na frente de" do ponto `sky_cover`.
// Requer: constants, cloud_panorama_tex, cloud_noise_sampler.

fn sky_cover(dir: vec3f) -> vec4f {
    let d = normalize(dir);
    let phi = atan2(d.z, d.x);
    let u = select(phi, phi + 2.0 * PI, phi < 0.0) / (2.0 * PI);
    let v = acos(clamp(d.y, -1.0, 1.0)) / PI;
    return textureSampleLevel(cloud_panorama_tex, cloud_noise_sampler, vec2f(u, v), 0.0);
}
