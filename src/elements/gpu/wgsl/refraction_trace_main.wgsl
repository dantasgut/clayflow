// Refração pela estrutura de raios (spec 034, R1–R2), o primeiro kernel: o caminho de cada pedido (os do vidro, gravados
// pelo passe de pedidos do desenho; os da água, pela vista da água) pelo núcleo `refraction_trace_ray` — o ponto
// reconstruído da distância, a normal, o IOR e o Abbe, a absorção e a parede fina; com dispersão, um raio por canal.
// Grava o que não depende das luzes (`refraction_partial`: rgb, e em a a distância à primeira superfície), a superfície
// vista (`refraction_hit`: ponto e se há superfície; `refraction_hit_info`: normal, instância, uv e a direção de onde
// se vê) e o quanto chega dela (`refraction_throughput`). O segundo kernel (`refraction_shade.wgsl`) soma a luz dela.
// Com dispersão, a superfície iluminada é a do canal verde (a emissão, o fundo e os reflexos seguem por canal).
// `refraction_hit.w`: 0 sem superfície a iluminar, 1 com ela, 2 com ela e dispersão.
// Requer: refraction_core, refraction_codec, cameras, refraction_frame, refraction_request (textura),
// refraction_distance e as saídas.

/** Ponto do pedido a partir da distância gravada pelo passe de pedidos. */
fn refraction_entry_point(cam: CameraMatrices, pixel: vec2u, dist: f32) -> vec3f {
    let size = vec2f(textureDimensions(refraction_distance));
    let ndc = vec2f((f32(pixel.x) + 0.5) / size.x * 2.0 - 1.0, 1.0 - (f32(pixel.y) + 0.5) / size.y * 2.0);
    // Linhas da rotação da vista = eixos da câmera no mundo.
    let right = vec3f(cam.view[0].x, cam.view[1].x, cam.view[2].x);
    let up = vec3f(cam.view[0].y, cam.view[1].y, cam.view[2].y);
    let back = vec3f(cam.view[0].z, cam.view[1].z, cam.view[2].z);
    let xv = ndc.x / cam.projection[0].x;
    let yv = ndc.y / cam.projection[1].y;
    if (cam.projection[3].w == 1.0) {
        // Ortográfica: a origem do raio no plano da câmera, ao longo do eixo da vista.
        return cam.position.xyz + right * xv + up * yv - back * dist;
    }
    let d = normalize(right * xv + up * yv - back);
    return cam.position.xyz + d * dist;
}

@compute @workgroup_size(8, 8, 1)
fn refraction_trace_main(@builtin(global_invocation_id) gid: vec3u) {
    let size = textureDimensions(refraction_request);
    if (gid.x >= size.x || gid.y >= size.y) { return; }
    let pixel = vec2i(gid.xy);
    let req = textureLoad(refraction_request, pixel, 0);
    let tint = refraction_unpack_tint(req.w);
    if (tint.a <= 0.0) {
        // Sem pedido: sem superfície a iluminar (o segundo kernel lê só a marca).
        textureStore(refraction_hit, pixel, vec4f(0.0, 0.0, 0.0, -1.0));
        return;
    }
    let cam = cameras[refraction_frame.cameraSlot];
    let p = refraction_entry_point(cam, gid.xy, textureLoad(refraction_distance, pixel, 0).r);
    let n = refraction_oct_decode(unpack2x16snorm(req.x));
    let ior_abbe = unpack2x16float(req.y);
    let rough_depth = unpack2x16float(req.z);
    let thin = rough_depth.x < 0.0 && rough_depth.x > -1.5;
    let volume = rough_depth.x < -1.5;
    let back = vec3f(cam.view[0].z, cam.view[1].z, cam.view[2].z);
    let v = select(normalize(cam.position.xyz - p), back, cam.projection[3].w == 1.0);
    let time = refraction_frame.time;
    var path: RefractionPath;
    if (ior_abbe.y > 0.0 && !thin) {
        // Dispersão: um raio por canal; a superfície iluminada é a do verde.
        var radiance = vec3f(0.0);
        var throughput = vec3f(0.0);
        for (var k = 0u; k < 3u; k++) {
            var m = RefractionMedium(refraction_channel_ior(ior_abbe.x, ior_abbe.y, k), tint.rgb, rough_depth.y);
            if (volume) { m = RefractionMedium(m.ior, -log(max(tint.rgb, vec3f(1e-4))) / max(rough_depth.y, 1e-4), -1.0); }
            let r = refraction_trace_ray(cam, p, n, v, m, false, volume, k, time, true);
            radiance[k] = r.radiance[k];
            throughput[k] = r.throughput[k];
            if (k == 1u) { path = r; }
        }
        path.radiance = radiance;
        path.throughput = throughput;
    } else {
        // Entrada num volume: o meio dele com o coeficiente de absorção (marca de volume na pilha).
        var m = RefractionMedium(max(ior_abbe.x, 1.0), tint.rgb, rough_depth.y);
        if (volume) { m = RefractionMedium(m.ior, -log(max(tint.rgb, vec3f(1e-4))) / max(rough_depth.y, 1e-4), -1.0); }
        path = refraction_trace_ray(cam, p, n, v, m, thin, volume, 1u, time, false);
    }
    textureStore(refraction_partial, pixel, vec4f(path.radiance, path.first));
    // w: 0 sem superfície a iluminar; 1 com ela (a luz ou a cópia, mais a emissão); 2 com dispersão (só a luz: a emissão
    // por canal já veio).
    let dispersive = ior_abbe.y > 0.0 && !thin;
    textureStore(refraction_hit, pixel, vec4f(path.hit.position, select(0.0, select(1.0, 2.0, dispersive), path.lit)));
    textureStore(
        refraction_hit_info,
        pixel,
        vec4u(
            pack2x16snorm(refraction_oct_encode(path.hit.normal)),
            path.hit.instance,
            pack2x16float(path.hit.uv),
            pack2x16snorm(refraction_oct_encode(-path.dir)),
        ),
    );
    textureStore(refraction_throughput, pixel, vec4f(path.throughput, 1.0));
}
