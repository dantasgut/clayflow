// Cáusticas por fótons em espaço da luz (spec 017, research R7): um fóton por texel da superfície de água vista pela
// luz é refratado pela normal da superfície, segue até o receptor (o mapa de sombra: fundo e objetos submersos) por
// iteração de ponto fixo e deposita a energia transmitida (Fresnel × absorção no percurso) nos 4 texels vizinhos do
// ponto de chegada, em ponto fixo (`atomicAdd`): a soma inteira não depende da ordem — imagem determinística. A
// resolução converte para o fator de transmissão da luz (rgb) com um borrão em tenda 5×5. Espaço métrico da luz: NDC da
// matriz da água (`WaterLightMatrix`, ajustada à água) dividido pela escala de cada eixo; os receptores vêm do mapa de
// sombra da cena pela matriz dele. Structs `ShadowMatrix`, `WaterLightMatrix`, `FluidSurfaceMaterial` e
// `CausticParams` gerados dos schemas.
@group(0) @binding(0) var<storage, read> shadow_matrices: array<ShadowMatrix>;
@group(0) @binding(3) var<storage, read> water_light_matrix: WaterLightMatrix;
@group(0) @binding(1) var<storage, read> water_materials: array<FluidSurfaceMaterial>;
@group(0) @binding(2) var<uniform> caustic_params: CausticParams;
@group(1) @binding(0) var light_depth: texture_2d<f32>;
@group(1) @binding(1) var light_material: texture_2d<u32>;
@group(1) @binding(2) var caustic_shadow: texture_depth_2d;
@group(1) @binding(3) var<storage, read_write> photons: array<atomic<u32>>;
@group(2) @binding(0) var<storage, read_write> photon_sums: array<u32>;
@group(2) @binding(1) var caustic_out: texture_storage_2d<rgba16float, write>;

const CAUSTIC_NO_DEPTH: f32 = 1e8;
// Unidade do ponto fixo: energia 1 = 4096.
const CAUSTIC_ONE: f32 = 4096.0;
const CAUSTIC_ITERATIONS: i32 = 6;

fn caustic_texel_count() -> u32 {
    return caustic_params.width * caustic_params.height;
}

@compute @workgroup_size(64)
fn caustic_clear(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let i = gid3.x + gid3.y * nwg.x * 64u;
    if (i >= 3u * caustic_texel_count()) { return; }
    atomicStore(&photons[i], 0u);
}

// Ponto do mundo para coordenadas métricas da vista da luz da água (NDC / escala de cada eixo).
fn caustic_to_world(metric: vec3f, m: mat4x4f, scale: vec3f) -> vec3f {
    let b = metric - m[3].xyz / scale;
    let r0 = vec3f(m[0].x, m[1].x, m[2].x) / scale.x;
    let r1 = vec3f(m[0].y, m[1].y, m[2].y) / scale.y;
    let r2 = vec3f(m[0].z, m[1].z, m[2].z) / scale.z;
    return r0 * b.x + r1 * b.y + r2 * b.z;
}

// Profundidade métrica (na vista da luz da água) do receptor sob o ponto `xy`: o mapa de sombra da cena na mesma
// direção. Fora do mapa de sombra: sem receptor (muito longe).
fn caustic_receiver(xy: vec2f, m: mat4x4f, scale: vec3f) -> f32 {
    let q = caustic_to_world(vec3f(xy, 0.0), m, scale);
    let s = shadow_matrices[caustic_params.shadowSlot].lightViewProj;
    let c = s * vec4f(q, 1.0);
    let uv = vec2f(c.x * 0.5 + 0.5, 0.5 - c.y * 0.5);
    if (any(uv < vec2f(0.0)) || any(uv >= vec2f(1.0))) { return 2.0 * CAUSTIC_NO_DEPTH; }
    let dims = vec2i(textureDimensions(caustic_shadow));
    let t = clamp(vec2i(uv * vec2f(dims)), vec2i(0), dims - 1);
    let sz = water_affine_scale(s).z;
    return (textureLoad(caustic_shadow, t, 0) - c.z) / sz;
}

// Profundidade da água num texel (sem água: muito longe).
fn caustic_water(t: vec2i) -> f32 {
    let dims = vec2i(i32(caustic_params.width), i32(caustic_params.height));
    let q = clamp(t, vec2i(0), dims - 1);
    if (textureLoad(light_material, q, 0).x == 0u) { return 2.0 * CAUSTIC_NO_DEPTH; }
    return textureLoad(light_depth, q, 0).x;
}

// Inclinação da superfície ao longo de um eixo: diferença central, ou de um lado só na borda da água.
fn caustic_slope(t: vec2i, axis: vec2i, z: f32, texel: f32, limit: f32) -> f32 {
    let zp = caustic_water(t + axis);
    let zm = caustic_water(t - axis);
    let okp = abs(zp - z) < limit;
    let okm = abs(zm - z) < limit;
    if (okp && okm) { return (zp - zm) / (2.0 * texel); }
    if (okp) { return (zp - z) / texel; }
    if (okm) { return (z - zm) / texel; }
    return 0.0;
}

fn caustic_deposit(texel: vec2i, rgb: vec3f) {
    let dims = vec2i(i32(caustic_params.width), i32(caustic_params.height));
    if (texel.x < 0 || texel.y < 0 || texel.x >= dims.x || texel.y >= dims.y) { return; }
    let i = u32(texel.y * dims.x + texel.x);
    let n = caustic_texel_count();
    let q = vec3u(round(rgb * CAUSTIC_ONE));
    if (q.r > 0u) { atomicAdd(&photons[i], q.r); }
    if (q.g > 0u) { atomicAdd(&photons[n + i], q.g); }
    if (q.b > 0u) { atomicAdd(&photons[2u * n + i], q.b); }
}

@compute @workgroup_size(8, 8)
fn caustic_splat(@builtin(global_invocation_id) gid: vec3u) {
    let dims = vec2i(i32(caustic_params.width), i32(caustic_params.height));
    let t = vec2i(gid.xy);
    if (t.x >= dims.x || t.y >= dims.y) { return; }
    let m = textureLoad(light_material, t, 0).x;
    if (m == 0u) { return; }
    let z0 = textureLoad(light_depth, t, 0).x;
    if (z0 >= CAUSTIC_NO_DEPTH) { return; }
    let material = water_materials[m - 1u];
    let lvp = water_light_matrix.viewProj;
    let scale = water_affine_scale(lvp);
    // Centro do texel no espaço métrico da luz.
    let uv = (vec2f(t) + 0.5) / vec2f(dims);
    let xy0 = vec2f(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0) / scale.xy;
    // Um objeto entre a luz e a água: a água está na sombra, nenhum fóton.
    let zr0 = caustic_receiver(xy0, lvp, scale);
    if (zr0 < z0 || zr0 >= CAUSTIC_NO_DEPTH) { return; }
    let texel = vec2f(2.0) / (vec2f(dims) * scale.xy);
    let limit = 4.0 * max(texel.x, texel.y) + 0.05;
    let sx = caustic_slope(t, vec2i(1, 0), z0, texel.x, limit);
    // y da textura desce, y métrico sobe.
    let sy = -caustic_slope(t, vec2i(0, 1), z0, texel.y, limit);
    let n = normalize(vec3f(sx, sy, -1.0));
    let incident = vec3f(0.0, 0.0, 1.0);
    let eta = 1.0 / max(material.ior, 1.0);
    var dir = refract(incident, n, eta);
    if (dot(dir, dir) < 1e-8) { dir = incident; }
    // Intensidade do padrão: 0 = luz reta (só atenuação), 1 = refração física.
    let k = select(0.0, material.causticIntensity, material.caustics != 0u);
    dir = normalize(mix(incident, dir, k));
    let cos_i = max(-dot(incident, n), 0.0);
    let f0 = pow((material.ior - 1.0) / (material.ior + 1.0), 2.0);
    let fresnel = f0 + (1.0 - f0) * pow(1.0 - cos_i, 5.0);
    // Encontro com o receptor: t = (z_r(xy(t)) − z0) / d.z, ponto fixo.
    let dz = max(dir.z, 1e-3);
    var s = max(zr0 - z0, 0.0) / dz;
    for (var it: i32 = 0; it < CAUSTIC_ITERATIONS; it = it + 1) {
        let zr = caustic_receiver(xy0 + dir.xy * s, lvp, scale);
        if (zr >= CAUSTIC_NO_DEPTH) { break; }
        s = max(zr - z0, 0.0) / dz;
    }
    let hit = xy0 + dir.xy * s;
    let transmit = exp(-material.absorption.rgb * s) * (1.0 - fresnel);
    // Ponto de chegada em texels (contínuo) e depósito bilinear.
    let hit_ndc = hit * scale.xy;
    let hit_uv = vec2f(hit_ndc.x * 0.5 + 0.5, 0.5 - hit_ndc.y * 0.5);
    let f = hit_uv * vec2f(dims) - 0.5;
    let base = vec2i(floor(f));
    let w = f - floor(f);
    caustic_deposit(base, transmit * (1.0 - w.x) * (1.0 - w.y));
    caustic_deposit(base + vec2i(1, 0), transmit * w.x * (1.0 - w.y));
    caustic_deposit(base + vec2i(0, 1), transmit * (1.0 - w.x) * w.y);
    caustic_deposit(base + vec2i(1, 1), transmit * w.x * w.y);
}

fn caustic_sum(t: vec2i) -> vec3f {
    let dims = vec2i(i32(caustic_params.width), i32(caustic_params.height));
    let q = clamp(t, vec2i(0), dims - 1);
    let i = u32(q.y * dims.x + q.x);
    let n = caustic_texel_count();
    return vec3f(f32(photon_sums[i]), f32(photon_sums[n + i]), f32(photon_sums[2u * n + i])) / CAUSTIC_ONE;
}

@compute @workgroup_size(8, 8)
fn caustic_resolve(@builtin(global_invocation_id) gid: vec3u) {
    let dims = vec2i(i32(caustic_params.width), i32(caustic_params.height));
    let t = vec2i(gid.xy);
    if (t.x >= dims.x || t.y >= dims.y) { return; }
    var sum = vec3f(0.0);
    for (var dy: i32 = -2; dy <= 2; dy = dy + 1) {
        for (var dx: i32 = -2; dx <= 2; dx = dx + 1) {
            let w = f32((3 - abs(dx)) * (3 - abs(dy)));
            sum = sum + caustic_sum(t + vec2i(dx, dy)) * w;
        }
    }
    textureStore(caustic_out, t, vec4f(sum / 81.0, 1.0));
}
