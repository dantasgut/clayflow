// Composição óptica da água (spec 017, research R5): um triângulo de tela cheia sobre os alvos da cena. Por pixel com
// água: a normal da superfície (a do campo dos fluidos, spec 033: contínua, em mundo), refração da cena de antes da água (`background`, nunca o que
// está na frente da superfície), absorção pela espessura (Beer-Lambert por canal), dispersão interna iluminada,
// e a superfície como dielétrico físico (spec 011, R9): o especular GGX de IOR do material reflete todas as luzes e o
// hemisfério pelo ponto de cena `scene_lighting` (o sol estoura em HDR, sem corte), e só a energia que não reflete
// segue para a refração. Consome a superfície genérica (profundidade, material e normal com a espessura em w por
// pixel) — não sabe de partículas. As ondulações do material (`water_ripple.wgsl`) somam o detalhe fino à normal. A composição não sabe
// qual luz ilumina nem de onde vem a sombra.
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
    // Vista → mundo (vista rígida).
    let r = mat3x3f(cam.view[0].xyz, cam.view[1].xyz, cam.view[2].xyz);
    let rt = transpose(r);
    let pw = rt * (pv - cam.view[3].xyz);
    // Normal da superfície em mundo (sem ela, voltada para a câmera) e, em w, a espessura atravessada.
    let stored = textureLoad(water_normal, pi, 0);
    var n_sim = normalize(cam.position.xyz - pw);
    if (dot(stored.xyz, stored.xyz) > 1e-8) { n_sim = normalize(stored.xyz); }
    // Ondulações do material somadas à normal da simulação (faces voltadas para cima).
    let slope = water_ripple_slope(pw.xz, water_composite.time, material) * water_ripple_weight(n_sim);
    let n = normalize(n_sim + vec3f(-slope.x, 0.0, -slope.y));
    let nv = normalize(r * n);
    let v = normalize(cam.position.xyz - pw);
    // Espessura atravessada (limitada: dentro da água ela continua finita).
    let thickness = clamp(stored.w, 0.0, 1e3);
    // Refração: desloca a leitura da cena pela inclinação; o que está na frente da água não é refratado.
    let shift = vec2f(nv.x, -nv.y) * material.refraction * min(thickness, 1.0) * size.y;
    var pr = clamp(vec2i(frag.xy + shift), vec2i(0), size_i - 1);
    if (water_scene_linear(vec2f(pr), proj) < z) { pr = pi; }
    let background = textureLoad(water_background, pr, 0).rgb;
    // Superfície: dielétrico de IOR do material (Fresnel e GGX), refletindo as luzes e o hemisfério.
    let surface = closure_dielectric(material.ior, vec3f(1.0), material.roughness, 0.0, vec3f(0.0));
    let reflected = scene_lighting(surface, pw, n, v);
    let cos_v = clamp(dot(n, v), 1e-4, 1.0);
    let into = vec3f(1.0) - closure_base_albedo(surface, cos_v);
    // Dentro: o fundo atenuado por Beer-Lambert e a luz espalhada no volume, na cor da água.
    let absorb = exp(-material.absorption.rgb * thickness);
    let scattered = scene_lighting(closure_diffuse(material.color.rgb, 0.0), pw, n, v);
    let transmitted = background * absorb + scattered * (1.0 - absorb);
    var color = reflected + into * transmitted;
    if (!all(abs(color) < vec3f(6.5e4))) { color = material.color.rgb; }
    var out: CompositeOut;
    out.color = vec4f(max(color, vec3f(0.0)), 1.0);
    out.depth = clamp(water_ndc_depth(pv, proj), 0.0, 1.0);
    return out;
}
