// Injeção nos froxels (spec 033, R12): por froxel, num ponto sorteado dentro dele (jitter do quadro), a extinção dos
// volumes e a luz espalhada para a câmera — de cada luz do pool (a sombra pelo ponto `light_visibility`, o meio até a
// fonte por `light_transmission`: a atmosfera, a água e a própria névoa) pela fase de Henyey-Greenstein, mais a luz
// ambiente isotrópica (a grade grossa `froxel_ambient`: o hemisfério ou a luz rebatida das sondas) e a emissão. O quadro entra no
// histórico reprojetado (o mesmo ponto de mundo no quadro anterior) com peso 1 − FROXEL_HISTORY; o resultado,
// (espalhado rgb, extinção), vai ao histórico do quadro. O ponto sorteado segue a sequência de Halton do quadro
// deslocada por froxel.
// Requer: WORKGROUP_SIZE, FROXEL_HISTORY, froxels, cameras, media_common, media_volumes, lights, light_incoming,
// light_visibility, light_transmission, froxel_ambient, froxel_camera (leitura), froxel_sampler, froxel_history,
// froxel_history_out.

const FROXEL_PI: f32 = 3.14159265358979;

/** Fase de Henyey-Greenstein (cosseno entre a direção para a luz e a do raio da câmera). */
fn froxel_phase(cos_theta: f32, g: f32) -> f32 {
    let d = 1.0 + g * g - 2.0 * g * cos_theta;
    return (1.0 - g * g) / (4.0 * FROXEL_PI * d * sqrt(max(d, 1e-8)));
}

@compute @workgroup_size(WORKGROUP_SIZE)
fn froxel_inject_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let i = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    let dims = froxels.grid.xyz;
    if (i >= dims.x * dims.y * dims.z) { return; }
    let cell = vec3u(i % dims.x, (i / dims.x) % dims.y, i / (dims.x * dims.y));
    let cam = cameras[froxels.grid.w];
    // A sequência do quadro (Halton) girada por froxel (Cranley-Patterson): cada froxel percorre os seus pontos sem
    // que a grade inteira deslize junto de um quadro para o outro.
    let jitter = fract(froxels.frame.xyz + froxel_rotation(cell));
    let uv = (vec2f(cell.xy) + jitter.xy) / vec2f(dims.xy);
    let ndc = vec2f(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0);
    let z = froxel_slice_depth(f32(cell.z) + jitter.z);
    let p = froxel_world(cam, froxel_view_point(ndc, z, cam.projection));
    let ray = normalize(p - cam.position.xyz);
    // O trecho do raio da câmera nesta fatia (o meio homogêneo de borda nítida entra pela fração exata dentro dele).
    let stretch = distance(p, cam.position.xyz) / z;
    let t0 = froxel_slice_depth(f32(cell.z)) * stretch;
    let t1 = froxel_slice_depth(f32(cell.z) + 1.0) * stretch;

    var sigma_t = 0.0;
    var sigma_s = vec3f(0.0);
    var g_sum = 0.0;
    var emission = vec3f(0.0);
    let count = fog_count();
    for (var k = 0u; k < count; k++) {
        let v = fog_record(k);
        if (v.albedo.a < 0.5) { continue; }
        var d: f32;
        if (v.shape.y == FOG_DENSITY_CONSTANT && v.center.w <= 0.0) {
            let span = fog_span(v, cam.position.xyz, ray, t1);
            d = v.optics.x * max(span.y - max(span.x, t0), 0.0) / (t1 - t0);
        } else {
            d = fog_density(v, p);
        }
        if (d <= 0.0) { continue; }
        sigma_t += d;
        let s = v.albedo.rgb * d;
        sigma_s += s;
        g_sum += v.optics.y * (s.r + s.g + s.b);
        emission += v.emission.rgb * d;
    }
    var current = vec4f(0.0);
    if (sigma_t > 0.0) {
        let g = g_sum / max(sigma_s.r + sigma_s.g + sigma_s.b, 1e-12);
        var incoming = textureSampleLevel(froxel_ambient, froxel_sampler,
            vec3f(uv, (f32(cell.z) + jitter.z) / f32(dims.z)), 0.0).rgb;
        let lights_n = min(froxels.counts.y, arrayLength(&lights));
        for (var l = 0u; l < lights_n; l++) {
            let inc = light_incoming(lights[l], p);
            if (all(inc.radiance <= vec3f(0.0))) { continue; }
            let radiance = inc.radiance * light_visibility(l, p, 1.0) * light_transmission(l, p);
            incoming += radiance * froxel_phase(dot(inc.l, ray), g);
        }
        current = vec4f(sigma_s * incoming + emission, sigma_t);
    }
    // O centro do froxel no quadro anterior (a vista e a vista-projeção guardadas): o histórico onde ele estava — com a
    // câmera parada, o próprio texel.
    if (froxels.counts.w == 1u) {
        let uv_c = (vec2f(cell.xy) + 0.5) / vec2f(dims.xy);
        let ndc_c = vec2f(uv_c.x * 2.0 - 1.0, 1.0 - uv_c.y * 2.0);
        let center = froxel_world(cam, froxel_view_point(ndc_c, froxel_slice_depth(f32(cell.z) + 0.5), cam.projection));
        let f = froxel_locate(froxel_camera[0], froxel_camera[1], center);
        let w = f.z / f32(dims.z);
        if (all(f.xy >= vec2f(0.0)) && all(f.xy <= vec2f(1.0)) && w >= 0.0 && w <= 1.0) {
            let history = textureSampleLevel(froxel_history, froxel_sampler, vec3f(f.xy, w), 0.0);
            current = mix(current, history, FROXEL_HISTORY);
        }
    }
    textureStore(froxel_history_out, cell, current);
}
