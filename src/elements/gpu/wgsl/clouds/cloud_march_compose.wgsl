// A composição da marcha das nuvens (spec 041, R21; T074): por bloco, a luz do raio — a soma das amostras dele na lista
// do quadro, que o passe da luz calculou (`cloud_light_samples.wgsl`; da última à primeira, teto `CLOUD_MAX_STEPS`), mais
// a das que não couberam (`cloud_ray`) — e, na frente dela, o que está entre a câmera e a nuvem até a profundidade dela:
// os meios perto da câmera (`scene_near_fog`) e a perspectiva aérea além deles:
// `Sc = L·Tn·Ta(dc) + (1 − Tc)·(Sn + Tn·(Sa(dc) − Sa(alcance)))`. Saída `cloud_trace_out` (rgb, a = Tc).
// Despacho linear: um bloco por invocação.
// Requer: WORKGROUP_SIZE, cloud_common (CLOUD_MAX_STEPS), cloud_march_ray, sky_aerial_lookup, scene_near_fog, sky,
// cloud_ray, cloud_trace_depth, cloud_light_list, cloud_trace_out.

@compute @workgroup_size(WORKGROUP_SIZE)
fn cloud_march_compose_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let blocks = textureDimensions(cloud_trace_out);
    let i = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    if (i >= blocks.x * blocks.y) { return; }
    let g = vec2u(i % blocks.x, i / blocks.x);
    let marched = textureLoad(cloud_ray, g, 0);
    let trace = textureLoad(cloud_trace_depth, g, 0);
    let transmittance = marched.a;
    let depth = trace.r;
    var color = marched.rgb;
    let size = textureDimensions(cloud_light_list);
    var link = trace.b;
    for (var k = 0u; k < CLOUD_MAX_STEPS; k++) {
        if (link < 0.0) { break; }
        let at = u32(link);
        let v = textureLoad(cloud_light_list, vec2u(at % size.x, at / size.x), 0);
        color += v.rgb;
        link = v.a;
    }
    if (transmittance < 1.0) {
        // O que está entre a câmera e a nuvem (spec 041, R21): os meios perto da câmera (os froxels: a névoa dos volumes
        // e, quando a grade a integra, a atmosfera até o fim dela, com as sombras do terreno e das nuvens) e a tabela da
        // perspectiva aérea só do fim deles até a nuvem (a diferença da luz espalhada dela) — a luz não é contada duas
        // vezes. Sem a atmosfera na grade, o alcance é 0 e fica a tabela inteira.
        let r = cloud_march_ray(g);
        let uv = r.center / vec2f(cloud_scene_depth_size());
        let near = scene_near_fog(r.ray.origin + r.ray.dir * depth);
        let reach = min(near.reach, min(depth, SKY_AERIAL_RANGE * 1000.0));
        let aerial = sky_aerial(uv, r.ray.dir, depth);
        var front = near.fog.scattered;
        // A nuvem além do fim dos froxels: a tabela soma o trecho dele até ela (antes dele, nada a somar).
        if (reach < depth) {
            let start = sky_aerial(uv, r.ray.dir, reach);
            front += near.fog.transmittance * max(aerial.scattered - start.scattered, vec3f(0.0)) * sky.sunIlluminance.rgb;
        }
        color = color * near.fog.transmittance * aerial.transmittance + (1.0 - transmittance) * front;
    }
    textureStore(cloud_trace_out, g, vec4f(color, transmittance));
}
