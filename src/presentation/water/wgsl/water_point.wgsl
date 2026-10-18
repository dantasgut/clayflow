// O ponto da superfície da água num pixel (spec 017; spec 034): da superfície genérica do `WaterSurface` (profundidade
// linear, material e normal com a espessura em w), o ponto em mundo, a normal com as ondulações do material, a direção
// do observador e a espessura — o mesmo para a composição e para o traçado da refração da água.
// Requer: water_view, water_ripple, WATER_DEPTH_LIMIT, cameras, water_materials, water_composite, water_depth,
// water_material, water_normal.

/** Triângulo de tela cheia dos passes da água (a composição, os pedidos de refração). */
@vertex
fn water_composite_vs(@builtin(vertex_index) vi: u32) -> @builtin(position) vec4f {
    let x = f32((vi << 1u) & 2u);
    let y = f32(vi & 2u);
    return vec4f(x * 2.0 - 1.0, 1.0 - y * 2.0, 0.0, 1.0);
}

/** Ponto da água num pixel (`valid` falso sem água). */
struct WaterPoint {
    valid: bool,
    material: u32,
    view: vec3f,
    position: vec3f,
    normal: vec3f,
    to_eye: vec3f,
    thickness: f32,
}

// Ponto da vista no pixel com profundidade linear `z` (projeção simétrica; perspectiva ou ortográfica).
fn composite_view_pos(pixel: vec2f, z: f32, p: mat4x4f, size: vec2f) -> vec3f {
    let ndc = vec2f(pixel.x / size.x * 2.0 - 1.0, 1.0 - pixel.y / size.y * 2.0);
    if (abs(p[2].w) > 0.5) {
        return vec3f(ndc.x * z / p[0].x, ndc.y * z / p[1].y, -z);
    }
    return vec3f((ndc.x - p[3].x) / p[0].x, (ndc.y - p[3].y) / p[1].y, -z);
}

fn water_point(pi: vec2i) -> WaterPoint {
    var out: WaterPoint;
    out.valid = false;
    let m = textureLoad(water_material, pi, 0).x;
    if (m == 0u) { return out; }
    let z = textureLoad(water_depth, pi, 0).x;
    if (z >= WATER_DEPTH_LIMIT) { return out; }
    let size = vec2f(textureDimensions(water_depth));
    let material = water_materials[m - 1u];
    let cam = cameras[water_composite.cameraSlot];
    let pv = composite_view_pos(vec2f(pi) + 0.5, z, cam.projection, size);
    // Vista → mundo (vista rígida).
    let r = mat3x3f(cam.view[0].xyz, cam.view[1].xyz, cam.view[2].xyz);
    let pw = transpose(r) * (pv - cam.view[3].xyz);
    // Normal da superfície em mundo (sem ela, voltada para a câmera) e, em w, a espessura atravessada.
    let stored = textureLoad(water_normal, pi, 0);
    var n_sim = normalize(cam.position.xyz - pw);
    if (dot(stored.xyz, stored.xyz) > 1e-8) { n_sim = normalize(stored.xyz); }
    // Ondulações do material somadas à normal da simulação (faces voltadas para cima).
    let slope = water_ripple_slope(pw.xz, water_composite.time, material) * water_ripple_weight(n_sim);
    out.valid = true;
    out.material = m;
    out.view = pv;
    out.position = pw;
    out.normal = normalize(n_sim + vec3f(-slope.x, 0.0, -slope.y));
    out.to_eye = normalize(cam.position.xyz - pw);
    // Espessura atravessada (limitada: dentro da água ela continua finita).
    out.thickness = clamp(stored.w, 0.0, 1e3);
    return out;
}
