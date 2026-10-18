// O caminho de uma amostra de um pedido de refração (spec 034, R1–R2): o ponto reconstruído da distância (ou, nas
// amostras extras do antisserrilhado, a entrada do raio de um ponto dentro do pixel no plano tangente da face), a
// normal, o IOR e o Abbe, a absorção, a parede fina e a entrada num volume, pelo núcleo `refraction_trace_ray`. Com
// dispersão, a amostra do centro traça o raio do verde e grava a separação estimada entre o vermelho e o azul; onde ela
// aparece na imagem (a medida, pelos vizinhos), as amostras do pixel marcado traçam um raio por canal (a superfície
// iluminada é a do verde; a emissão, o fundo e os reflexos seguem por canal).
// Quem grava: a amostra do centro (`refraction_trace_main.wgsl`, nas texturas do pixel) e as extras
// (`refraction_trace_extra.wgsl`, nas da lista dos marcados).
// Requer: refraction_core, refraction_codec, cameras, refraction_frame, refraction_request (textura),
// refraction_distance.

/** Deslocamento (pixels) da amostra extra `s` dentro do pixel: três pontos a 120° num raio de 0,35 px. */
fn refraction_sample_offset(s: u32) -> vec2f {
    let a = (f32(s) - 1.0) * 2.0943951 + 0.5235988;
    return 0.35 * vec2f(cos(a), sin(a));
}

/** O raio da câmera pelo ponto `pixel` (fracionário) da imagem: origem e direção. */
fn refraction_camera_ray(cam: CameraMatrices, pixel: vec2f, size: vec2f) -> array<vec3f, 2> {
    let ndc = vec2f(pixel.x / size.x * 2.0 - 1.0, 1.0 - pixel.y / size.y * 2.0);
    let right = vec3f(cam.view[0].x, cam.view[1].x, cam.view[2].x);
    let up = vec3f(cam.view[0].y, cam.view[1].y, cam.view[2].y);
    let back = vec3f(cam.view[0].z, cam.view[1].z, cam.view[2].z);
    let xv = ndc.x / cam.projection[0].x;
    let yv = ndc.y / cam.projection[1].y;
    if (cam.projection[3].w == 1.0) {
        return array<vec3f, 2>(cam.position.xyz + right * xv + up * yv, -back);
    }
    return array<vec3f, 2>(cam.position.xyz, normalize(right * xv + up * yv - back));
}

/** Ponto do pedido a partir da distância gravada pelo passe de pedidos (ao longo do raio do centro do pixel). */
fn refraction_entry_point(cam: CameraMatrices, pixel: vec2u, dist: f32) -> vec3f {
    let size = vec2f(textureDimensions(refraction_distance));
    let ray = refraction_camera_ray(cam, vec2f(pixel) + 0.5, size);
    return ray[0] + ray[1] * dist;
}

/** A normal do pedido do vizinho `pixel + step` (a do pixel, sem pedido ou fora da tela). */
fn refraction_neighbor_normal(pixel: vec2i, step: vec2i, fallback: vec3f) -> vec3f {
    let q = pixel + step;
    let size = vec2i(textureDimensions(refraction_request));
    if (any(q < vec2i(0)) || any(q >= size)) { return fallback; }
    let req = textureLoad(refraction_request, q, 0);
    if (refraction_unpack_tint(req.w).a <= 0.0) { return fallback; }
    return refraction_oct_decode(unpack2x16snorm(req.x));
}

/** O caminho de uma amostra de um pixel, no formato das saídas do primeiro kernel. */
struct RefractionSample {
    /** O que não depende das luzes (rgb) e a distância à primeira superfície (a). */
    partial: vec4f,
    /** O ponto da superfície vista e a marca (w: −1 sem pedido, 0 sem superfície, 1 com ela, 2 com dispersão). */
    hit: vec4f,
    /** Normal, instância, uv e a direção de onde se vê. */
    info: vec4u,
    /** O quanto chega da superfície vista. */
    throughput: vec4f,
}

/** O meio da entrada de um pedido no canal `k` (num volume, com o coeficiente de absorção: a marca de volume na pilha). */
fn refraction_entry_medium(ior_abbe: vec2f, rough_depth: vec2f, tint: vec3f, volume: bool, dn: f32, k: u32) -> RefractionMedium {
    let ior = select(max(ior_abbe.x, 1.0), refraction_channel_ior(ior_abbe.x, ior_abbe.y, k), ior_abbe.y > 0.0);
    if (volume) {
        return RefractionMedium(ior, -log(max(tint, vec3f(1e-4))) / max(rough_depth.y, 1e-4), -1.0, dn);
    }
    return RefractionMedium(ior, tint, rough_depth.y, dn);
}

/** O raio do verde, com a separação estimada entre o vermelho e o azul (a amostra do centro). */
const REFRACTION_GREEN: i32 = -1;
/** Os três canais, a superfície iluminada a do verde. */
const REFRACTION_CHANNELS: i32 = 3;

/**
 * O caminho de uma amostra do pedido do pixel no ponto `offset` (pixels) a partir do centro (0: a amostra do centro).
 * Com dispersão, `channel`: `REFRACTION_GREEN`, `REFRACTION_CHANNELS`, ou só o raio do canal 0, 1 ou 2 (com a
 * superfície que ele próprio atinge) — os pixels marcados pela medida onde a separação das cores aparece.
 */
fn refraction_trace_pixel(pixel: vec2i, offset: vec2f, channel: i32) -> RefractionSample {
    var out: RefractionSample;
    let req = textureLoad(refraction_request, pixel, 0);
    let tint = refraction_unpack_tint(req.w);
    if (tint.a <= 0.0) {
        // Sem pedido: nada a iluminar (o segundo kernel lê só a marca).
        out.hit = vec4f(0.0, 0.0, 0.0, -1.0);
        return out;
    }
    let cam = cameras[refraction_frame.cameraSlot];
    var n = refraction_oct_decode(unpack2x16snorm(req.x));
    var p = refraction_entry_point(cam, vec2u(pixel), textureLoad(refraction_distance, pixel, 0).r);
    if (any(offset != vec2f(0.0))) {
        // A entrada da amostra extra: o raio do ponto dentro do pixel no plano tangente da face, com a normal
        // interpolada pelos pedidos dos vizinhos (numa lente, o que muda o raio dentro do pixel é a normal).
        let size = vec2f(textureDimensions(refraction_distance));
        let ray = refraction_camera_ray(cam, vec2f(pixel) + 0.5 + offset, size);
        let den = dot(ray[1], n);
        if (abs(den) > 1e-6) { p = ray[0] + ray[1] * (dot(p - ray[0], n) / den); }
        let dx = refraction_neighbor_normal(pixel, vec2i(select(-1, 1, offset.x >= 0.0), 0), n) - n;
        let dy = refraction_neighbor_normal(pixel, vec2i(0, select(-1, 1, offset.y >= 0.0)), n) - n;
        n = normalize(n + dx * abs(offset.x) + dy * abs(offset.y));
    }
    let ior_abbe = unpack2x16float(req.y);
    let rough_depth = unpack2x16float(req.z);
    let thin = rough_depth.x < 0.0 && rough_depth.x > -1.5;
    let volume = rough_depth.x < -1.5;
    let back = vec3f(cam.view[0].z, cam.view[1].z, cam.view[2].z);
    let v = select(normalize(cam.position.xyz - p), back, cam.projection[3].w == 1.0);
    let time = refraction_frame.time;
    // O meio da entrada no canal `k`; num volume, com o coeficiente de absorção (a marca de volume na pilha).
    let disperses = ior_abbe.y > 0.0 && !thin;
    let dn = select(0.0, refraction_channel_dn(ior_abbe.x, ior_abbe.y), disperses);
    var path: RefractionPath;
    let channels = disperses && channel >= 0;
    if (channels && channel < REFRACTION_CHANNELS) {
        // O raio de um canal, com a superfície que ele atinge; a emissão e o fundo dele vêm do caminho.
        let k = u32(channel);
        path = refraction_trace_ray(cam, p, n, v, refraction_entry_medium(ior_abbe, rough_depth, tint.rgb, volume, dn, k), false, volume, k, time, true);
    } else if (channels) {
        // Dispersão: um raio por canal; a superfície iluminada é a do verde (a emissão, o fundo e os reflexos de cada
        // canal vêm do caminho dele).
        var radiance = vec3f(0.0);
        var throughput = vec3f(0.0);
        for (var k = 0u; k < 3u; k++) {
            let r = refraction_trace_ray(cam, p, n, v, refraction_entry_medium(ior_abbe, rough_depth, tint.rgb, volume, dn, k), false, volume, k, time, true);
            radiance[k] = r.radiance[k];
            throughput[k] = r.throughput[k];
            if (k == 1u) { path = r; }
        }
        path.radiance = radiance;
        path.throughput = throughput;
    } else {
        // Um raio, o do verde: sem dispersão, ou com ela onde a separação das cores não aparece na imagem (a medida
        // decide pelos vizinhos, com a separação estimada pelo caminho).
        path = refraction_trace_ray(cam, p, n, v, refraction_entry_medium(ior_abbe, rough_depth, tint.rgb, volume, dn, 1u), thin, volume, 1u, time, false);
    }
    out.partial = vec4f(path.radiance, path.first);
    // w: 0 sem superfície a iluminar; 1 com ela (a luz, mais a emissão); 2 por canal (só a luz: a emissão por canal já
    // veio). Sem superfície, o ponto é a direção de quem escapou (a medida compara a dos vizinhos).
    let traced = channels;
    out.hit = vec4f(select(path.dir, path.hit.position, path.lit), select(0.0, select(1.0, 2.0, traced), path.lit));
    out.info = vec4u(
        pack2x16snorm(refraction_oct_encode(path.hit.normal)),
        path.hit.instance,
        pack2x16float(path.hit.uv),
        pack2x16snorm(refraction_oct_encode(-path.dir)),
    );
    // a: a separação entre o vermelho e o azul do raio do verde (−1 sem dispersão a decidir).
    out.throughput = vec4f(path.throughput, select(-1.0, path.spread, disperses && channel == REFRACTION_GREEN));
    return out;
}

