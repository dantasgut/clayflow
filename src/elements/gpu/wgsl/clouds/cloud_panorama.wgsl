// Panorama das nuvens (spec 041, R12): a esfera de direções em latitude-longitude vista da posição da câmera
// (`clouds.eye`), cada texel marchado com o orçamento do panorama (`clouds.timing.y` passos, 3 de luz) e a perspectiva
// aérea até a nuvem pelas tabelas da atmosfera (`sky_aerial_far`): a luz espalhada (rgb) e a transmitância (a). Lido
// pelo ponto `sky_cover` (o céu dos raios que escapam: a refração, o reflexo na água, as sondas da GI). Inteiro a cada
// quadro.
// Despacho linear: um texel por invocação.
// Requer: WORKGROUP_SIZE, constants, cloud_light, sky_aerial_lookup, clouds, cloud_panorama_out.

@compute @workgroup_size(WORKGROUP_SIZE)
fn cloud_panorama_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let size = textureDimensions(cloud_panorama_out);
    let i = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    if (i >= size.x * size.y) { return; }
    let g = vec3u(i % size.x, i / size.x, 0u);
    let uv = (vec2f(g.xy) + 0.5) / vec2f(size);
    let phi = uv.x * 2.0 * PI;
    let theta = uv.y * PI;
    let dir = vec3f(sin(theta) * cos(phi), cos(theta), sin(theta) * sin(phi));
    let s = cloud_integrate(clouds.eye.xyz, dir, 1e30, u32(clouds.timing.y), 3u, 0.5, 0.0);
    var color = s.scattered;
    if (s.transmittance < 1.0) {
        let a = sky_aerial_far(dir, 0.0, SkyAerial(vec3f(0.0), vec3f(1.0)), s.depth * 0.001);
        color = color * a.transmittance + (1.0 - s.transmittance) * a.scattered * sky.sunIlluminance.rgb;
    }
    textureStore(cloud_panorama_out, g.xy, vec4f(color, s.transmittance));
}
