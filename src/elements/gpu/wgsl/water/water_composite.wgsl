// Composição óptica da água (spec 017, research R5): um triângulo de tela cheia sobre os alvos da cena. Por pixel com
// água: normal reconstruída da profundidade suavizada, refração da cena de antes da água (`background`, nunca o que
// está na frente da superfície), absorção pela espessura (Beer-Lambert por canal), dispersão interna iluminada,
// reflexão do ambiente com Fresnel e brilho especular sob a sombra da cena. Consome a superfície genérica
// (profundidade, espessura e material por pixel) — não sabe de partículas. Structs `CameraMatrices`, `Light`,
// `ShadowMap`, `ShadowMatrix`, `FluidSurfaceMaterial` e `WaterCompositeParams` gerados dos schemas; a profundidade da
// cena vem do módulo da variante (com ou sem amostras).
@group(0) @binding(0) var<storage, read> cameras: array<CameraMatrices>;
@group(0) @binding(1) var<storage, read> lights: array<Light>;
@group(0) @binding(2) var<storage, read> shadow_maps: array<ShadowMap>;
@group(0) @binding(3) var<storage, read> shadow_matrices: array<ShadowMatrix>;
@group(0) @binding(4) var<storage, read> water_materials: array<FluidSurfaceMaterial>;
@group(0) @binding(5) var<uniform> water_composite: WaterCompositeParams;
@group(1) @binding(0) var water_depth: texture_2d<f32>;
@group(1) @binding(1) var water_thickness: texture_2d<f32>;
@group(1) @binding(2) var water_material: texture_2d<u32>;
@group(1) @binding(3) var water_background: texture_2d<f32>;
@group(2) @binding(0) var shadow_map: texture_depth_2d;
@group(2) @binding(1) var shadow_sampler: sampler_comparison;

const COMPOSITE_NO_DEPTH: f32 = 1e8;
const COMPOSITE_DEFAULT_LIGHT_DIR = vec3f(0.4, -1.0, 0.6);

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
    if (zq >= COMPOSITE_NO_DEPTH || abs(zq - z) > limit) { return z; }
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
    if (z >= COMPOSITE_NO_DEPTH) { discard; }
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
    let n = normalize(rt * nv);
    let pw = rt * (pv - cam.view[3].xyz);
    let v = normalize(cam.position.xyz - pw);
    // Espessura atravessada (limitada: dentro da água ela continua finita).
    let thickness = clamp(textureLoad(water_thickness, pi, 0).x, 0.0, 1e3);
    // Refração: desloca a leitura da cena pela inclinação; o que está na frente da água não é refratado.
    let shift = vec2f(nv.x, -nv.y) * material.refraction * min(thickness, 1.0) * size.y;
    var pr = clamp(vec2i(frag.xy + shift), vec2i(0), size_i - 1);
    if (water_scene_linear(vec2f(pr), proj) < z) { pr = pi; }
    let background = textureLoad(water_background, pr, 0).rgb;
    // Luz que ilumina e sombra da cena na superfície.
    var light_dir = COMPOSITE_DEFAULT_LIGHT_DIR;
    if (water_composite.lightSlot != 0xFFFFFFFFu) {
        light_dir = lights[water_composite.lightSlot].direction.xyz;
    }
    let l = normalize(-light_dir);
    let n_dot_l = max(dot(n, l), 0.0);
    let sm = shadow_maps[water_composite.shadowSlot];
    let shadow = sample_shadow_pcf(
        shadow_map, shadow_sampler, shadow_matrices[water_composite.shadowSlot].lightViewProj, pw, sm.bias,
        water_composite.shadowEnabled, n_dot_l,
    );
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
