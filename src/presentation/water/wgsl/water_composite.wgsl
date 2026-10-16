// Composição óptica da água (spec 017, research R5): um triângulo de tela cheia sobre os alvos da cena. Por pixel com
// água: normal reconstruída da profundidade suavizada, refração da cena de antes da água (`background`, nunca o que
// está na frente da superfície), absorção pela espessura (Beer-Lambert por canal), dispersão interna iluminada,
// reflexão do ambiente com Fresnel e brilho especular sob a sombra da cena. Consome a superfície genérica
// (profundidade, espessura e material por pixel) — não sabe de partículas. As ondulações do material
// (`water_ripple.wgsl`) somam o detalhe fino à normal. A luz vem dos pontos de cena do sombreamento
// (`scene_light_direction`, `light_visibility`): a composição não sabe qual luz ilumina nem de onde vem a sombra.
// Structs `CameraMatrices`, `FluidSurfaceMaterial` e `WaterCompositeParams` gerados dos schemas; recursos declarados em
// `water/shaders.ts`; a profundidade da cena vem do módulo da variante (com ou sem amostras).

@vertex
fn water_composite_vs(@builtin(vertex_index) vi: u32) -> @builtin(position) vec4f {
    let x = f32((vi << 1u) & 2u);
    let y = f32(vi & 2u);
    return vec4f(x * 2.0 - 1.0, 1.0 - y * 2.0, 0.0, 1.0);
}

// Ponto da vista no pixel com profundidade linear `z` (projeção simétrica; perspectiva ou ortográfica).
fn composite_view_pos(pixel: vec2f, z: f32, p: mat4x4f, size: vec2f) -> vec3f {
    let ndc = vec2f(pixel.x / size.x * 2.0 - 1.0, 1.0 - pixel.y / size.y * 2.0);
    if (abs(p[2].w) > 0.5) {
        return vec3f(ndc.x * z / p[0].x, ndc.y * z / p[1].y, -z);
    }
    return vec3f((ndc.x - p[3].x) / p[0].x, (ndc.y - p[3].y) / p[1].y, -z);
}

// Profundidade de um vizinho válido (mesmo material, sem salto além do limiar); senão, a do centro.
fn composite_neighbor(q: vec2i, m: u32, z: f32, limit: f32, size: vec2i) -> f32 {
    let c = clamp(q, vec2i(0), size - 1);
    if (textureLoad(water_material, c, 0).x != m) { return z; }
    let zq = textureLoad(water_depth, c, 0).x;
    if (zq >= WATER_DEPTH_LIMIT || abs(zq - z) > limit) { return z; }
    return zq;
}

struct CompositeOut {
    @location(0) color: vec4f,
    @builtin(frag_depth) depth: f32,
}

@fragment
fn water_composite_fs(@builtin(position) frag: vec4f) -> CompositeOut {
    let size_i = vec2i(textureDimensions(water_depth));
    let size = vec2f(size_i);
    let pi = vec2i(frag.xy);
    let m = textureLoad(water_material, pi, 0).x;
    if (m == 0u) { discard; }
    let z = textureLoad(water_depth, pi, 0).x;
    if (z >= WATER_DEPTH_LIMIT) { discard; }
    let material = water_materials[m - 1u];
    let cam = cameras[water_composite.cameraSlot];
    let proj = cam.projection;
    let pv = composite_view_pos(frag.xy, z, proj, size);
    // Normal: de cada eixo, o lado de menor variação (sem serrilhado na silhueta).
    let limit = max(z * 0.05, 0.02);
    let zr = composite_neighbor(pi + vec2i(1, 0), m, z, limit, size_i);
    let zl = composite_neighbor(pi - vec2i(1, 0), m, z, limit, size_i);
    let zd = composite_neighbor(pi + vec2i(0, 1), m, z, limit, size_i);
    let zu = composite_neighbor(pi - vec2i(0, 1), m, z, limit, size_i);
    var ddx = composite_view_pos(frag.xy + vec2f(1.0, 0.0), zr, proj, size) - pv;
    if (abs(zl - z) < abs(zr - z)) {
        ddx = pv - composite_view_pos(frag.xy - vec2f(1.0, 0.0), zl, proj, size);
    }
    var ddy = composite_view_pos(frag.xy + vec2f(0.0, 1.0), zd, proj, size) - pv;
    if (abs(zu - z) < abs(zd - z)) {
        ddy = pv - composite_view_pos(frag.xy - vec2f(0.0, 1.0), zu, proj, size);
    }
    var nv = normalize(cross(ddy, ddx));
    if (dot(nv, pv) > 0.0) { nv = -nv; }
    if (!all(abs(nv) <= vec3f(1.0))) { nv = vec3f(0.0, 0.0, 1.0); }
    // Vista → mundo (vista rígida).
    let r = mat3x3f(cam.view[0].xyz, cam.view[1].xyz, cam.view[2].xyz);
    let rt = transpose(r);
    let pw = rt * (pv - cam.view[3].xyz);
    // Ondulações do material somadas à normal da simulação (faces voltadas para cima).
    let n_sim = normalize(rt * nv);
    let slope = water_ripple_slope(pw.xz, water_composite.time, material) * water_ripple_weight(n_sim);
    let n = normalize(n_sim + vec3f(-slope.x, 0.0, -slope.y));
    nv = normalize(r * n);
    let v = normalize(cam.position.xyz - pw);
    // Espessura atravessada (limitada: dentro da água ela continua finita).
    let thickness = clamp(textureLoad(water_thickness, pi, 0).x, 0.0, 1e3);
    // Refração: desloca a leitura da cena pela inclinação; o que está na frente da água não é refratado.
    let shift = vec2f(nv.x, -nv.y) * material.refraction * min(thickness, 1.0) * size.y;
    var pr = clamp(vec2i(frag.xy + shift), vec2i(0), size_i - 1);
    if (water_scene_linear(vec2f(pr), proj) < z) { pr = pi; }
    let background = textureLoad(water_background, pr, 0).rgb;
    // Luz que ilumina e sombra da cena na superfície (pontos de cena: direção padrão e visibilidade 1 sem luz que
    // projeta sombra).
    let light_dir = scene_light_direction();
    let l = normalize(-light_dir);
    let n_dot_l = max(dot(n, l), 0.0);
    let shadow = light_visibility(pw, n_dot_l);
    let absorb = exp(-material.absorption.rgb * thickness);
    let lit = BRDF_AMBIENT + BRDF_DIFFUSE * n_dot_l * shadow;
    let transmitted = background * absorb + material.color.rgb * (1.0 - absorb) * lit;
    let f0 = pow((material.ior - 1.0) / (material.ior + 1.0), 2.0);
    let cos_v = clamp(dot(n, v), 0.0, 1.0);
    let fresnel = clamp((f0 + (1.0 - f0) * pow(1.0 - cos_v, 5.0)) * material.reflectivity, 0.0, 1.0);
    let h = normalize(l + v);
    // Brilho da luz refletida: como a reflexão, escalado pela refletividade do material.
    let specular = pow(max(dot(n, h), 0.0), max(material.shininess, 1.0)) * shadow
        * (material.shininess + 8.0) / 64.0 * material.reflectivity;
    var color = mix(transmitted, material.ambient.rgb, fresnel) + vec3f(specular);
    if (!all(abs(color) < vec3f(1e30))) { color = material.color.rgb; }
    var out: CompositeOut;
    out.color = vec4f(clamp(color, vec3f(0.0), vec3f(1.0)), 1.0);
    out.depth = clamp(water_ndc_depth(pv, proj), 0.0, 1.0);
    return out;
}
