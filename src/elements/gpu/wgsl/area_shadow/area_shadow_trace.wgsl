// O traçado da sombra das luzes de área (spec 013, R5): por texel da meia resolução, um pixel do bloco 2 × 2 (o da vez no
// quadro), o ponto de mundo dele pela profundidade da cena e, para cada luz de área com sombra, um raio a um ponto
// sorteado no retângulo dela — 1 se chega, 0 se algo tapa. O ponto fica em `as_point_out` (w = 1; sem superfície, −1).
// Requer: view_space, random, cameras, lights, ray_scene, asp (parâmetros), area_shadow_depth (a profundidade da cena).

/** O pixel do bloco 2 × 2 traçado no quadro `frame`: os quatro em quatro quadros. */
fn as_block_pixel(frame: u32) -> vec2i {
    let t = frame & 3u;
    return vec2i(i32(t & 1u), i32((t >> 1u) ^ (t & 1u)));
}

/** O ponto de mundo do pixel `px` (o centro dele, sem o deslocamento da amostra) na profundidade `depth`. */
fn as_world(px: vec2i, size: vec2f, depth: f32) -> vec3f {
    let cam = cameras[asp.cameraSlot];
    let h = cam.inverseUnjitteredViewProjection * vec4f(pixel_to_ndc(vec2f(px) + 0.5, size), depth, 1.0);
    return h.xyz / h.w;
}

/** A diferença de posição ao vizinho do eixo `axis` do lado em que a profundidade muda menos (o da mesma superfície). */
fn as_tangent(px: vec2i, axis: vec2i, full: vec2i, size: vec2f, p: vec3f, depth: f32) -> vec3f {
    let a = clamp(px + axis, vec2i(0), full - 1);
    let b = clamp(px - axis, vec2i(0), full - 1);
    let da = area_shadow_depth(a);
    let db = area_shadow_depth(b);
    if (abs(da - depth) <= abs(db - depth)) { return as_world(a, size, da) - p; }
    return p - as_world(b, size, db);
}

@compute @workgroup_size(8, 8)
fn area_shadow_trace_main(@builtin(global_invocation_id) gid: vec3u) {
    let dim = textureDimensions(as_traced_out);
    if (gid.x >= dim.x || gid.y >= dim.y) { return; }
    let q = vec2i(gid.xy);
    let full = vec2i(area_shadow_depth_size());
    let size = vec2f(full);
    let px = min(q * 2 + as_block_pixel(asp.frame), full - 1);
    let depth = area_shadow_depth(px);
    if (depth >= 1.0) {
        textureStore(as_traced_out, q, vec4f(1.0));
        textureStore(as_point_out, q, vec4f(0.0, 0.0, 0.0, -1.0));
        return;
    }
    let cam = cameras[asp.cameraSlot];
    let p = as_world(px, size, depth);
    let to_eye = cam.position.xyz - p;
    let far = length(to_eye);
    // A normal da superfície pelos vizinhos da profundidade, do lado da câmera.
    var n = cross(as_tangent(px, vec2i(1, 0), full, size, p, depth), as_tangent(px, vec2i(0, 1), full, size, p, depth));
    let nl = length(n);
    n = select(to_eye / max(far, 1e-9), n / max(nl, 1e-30), nl > 0.0);
    if (dot(n, to_eye) < 0.0) { n = -n; }
    let origin = p + n * (1.0e-3 * far + 1.0e-5);
    var visible = vec4f(1.0);
    let index = u32(px.y) * u32(full.x) + u32(px.x);
    for (var c = 0u; c < 4u; c++) {
        if (c >= asp.count) { break; }
        let light = lights[asp.lights[c]];
        let centre = light.position.xyz;
        let ln = normalize(light.direction.xyz);
        // Atrás do lado que emite: a luz não chega de qualquer modo.
        if (dot(p - centre, ln) <= 0.0) { continue; }
        let ax = light.axis.xyz;
        let up = cross(ln, ax);
        // O ponto do retângulo: o sorteio do pixel avançado a cada quadro pela sequência R2 (as amostras de quadros
        // seguidos cobrem o retângulo por igual).
        var state = random_seed(RANDOM_STREAM_USER + 13u + c, index, 0u);
        let u = fract(vec2f(random_unit(random_next(&state)), random_unit(random_next(&state)))
            + f32(asp.frame & 1023u) * vec2f(0.7548776662, 0.5698402910));
        let aim = centre + ax * ((2.0 * u.x - 1.0) * light.cones.x) + up * ((2.0 * u.y - 1.0) * light.cones.y);
        let d = aim - origin;
        let reach = length(d);
        // O ponto do retângulo abaixo do horizonte da superfície não a ilumina (a integral da luz já o exclui): não
        // conta como tapado.
        if (reach <= 0.0 || dot(n, d) <= 0.0) { continue; }
        if (ray_scene_occluded(origin, d / reach, reach * 0.999)) { visible[c] = 0.0; }
    }
    textureStore(as_traced_out, q, visible);
    textureStore(as_point_out, q, vec4f(p, 1.0));
}
