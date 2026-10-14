// Suavização da superfície de água (spec 017): filtro separável de faixa estreita sobre a profundidade linear (van der
// Laan et al. 2009; Truong e Yuksel 2018). Um passo por direção; o raio em pixels é o raio da suavização do material
// projetado na profundidade do pixel. Amostras sem água, de outro material ou atrás além do limiar de descontinuidade
// não entram (silhuetas preservadas); as da frente além do limiar são grampeadas a ele. A espessura passa por um
// borrão gaussiano curto. Structs `CameraMatrices`, `WaterLightMatrix`, `FluidSurfaceMaterial` e `WaterSmoothParams`
// gerados dos schemas.
@group(0) @binding(0) var<storage, read> cameras: array<CameraMatrices>;
@group(0) @binding(1) var<storage, read> water_light_matrix: WaterLightMatrix;
@group(0) @binding(2) var<storage, read> water_materials: array<FluidSurfaceMaterial>;
@group(0) @binding(3) var<storage, read> water_radii: array<f32>;
@group(0) @binding(4) var<uniform> water_smooth: WaterSmoothParams;
@group(1) @binding(0) var smooth_src: texture_2d<f32>;
@group(1) @binding(1) var smooth_material: texture_2d<u32>;
@group(1) @binding(2) var smooth_dst: texture_storage_2d<r32float, write>;

const WATER_NO_DEPTH: f32 = 1e9;
const WATER_MAX_TAPS: i32 = 32;

// Pixels por metro na profundidade `z`: pela projeção da câmera, ou pela escala do eixo y da matriz da luz.
fn water_smooth_ppm(z: f32, height: f32) -> f32 {
    if (water_smooth.view == 0u) {
        return water_pixels_per_meter(cameras[water_smooth.cameraSlot].projection, z, height);
    }
    return water_affine_scale(water_light_matrix.viewProj).y * 0.5 * height;
}

@compute @workgroup_size(8, 8)
fn water_smooth_depth(@builtin(global_invocation_id) gid: vec3u) {
    let size = vec2i(textureDimensions(smooth_src));
    let p = vec2i(gid.xy);
    if (p.x >= size.x || p.y >= size.y) { return; }
    let z = textureLoad(smooth_src, p, 0).x;
    let m = textureLoad(smooth_material, p, 0).x;
    if (m == 0u || z >= WATER_NO_DEPTH) {
        textureStore(smooth_dst, p, vec4f(WATER_NO_DEPTH, 0.0, 0.0, 0.0));
        return;
    }
    let material = water_materials[m - 1u];
    let r = water_radii[m - 1u];
    let ppm = water_smooth_ppm(z, f32(size.y));
    let radius_px = clamp(material.smoothingRadius * r * ppm, 0.0, 32.0);
    if (radius_px < 0.5) {
        textureStore(smooth_dst, p, vec4f(z, 0.0, 0.0, 0.0));
        return;
    }
    let step = max(1, i32(ceil(radius_px / f32(WATER_MAX_TAPS))));
    let taps = min(WATER_MAX_TAPS, i32(ceil(radius_px / f32(step))));
    let sigma = radius_px * 0.5;
    let threshold = material.depthThreshold * r;
    let dir = select(vec2i(1, 0), vec2i(0, 1), water_smooth.direction == 1u);
    var sum = z;
    var weight = 1.0;
    for (var k: i32 = 1; k <= taps; k = k + 1) {
        let offset = k * step;
        let w_space = exp(-f32(offset * offset) / (2.0 * sigma * sigma));
        for (var s: i32 = -1; s <= 1; s = s + 2) {
            let q = clamp(p + dir * offset * s, vec2i(0), size - 1);
            let zq = textureLoad(smooth_src, q, 0).x;
            let mq = textureLoad(smooth_material, q, 0).x;
            if (mq != m || zq >= WATER_NO_DEPTH) { continue; }
            // Faixa estreita: amostra atrás além do limiar é outra superfície (ignorada); à frente, grampeada ao
            // limiar — a borda não "puxa" o centro e lâminas finas não viram filetes.
            if (zq > z + threshold) { continue; }
            let zc = max(zq, z - threshold);
            sum = sum + zc * w_space;
            weight = weight + w_space;
        }
    }
    textureStore(smooth_dst, p, vec4f(sum / weight, 0.0, 0.0, 0.0));
}

// Borrão gaussiano curto da espessura (raio fixo de 4 px), separável.
@compute @workgroup_size(8, 8)
fn water_smooth_thickness(@builtin(global_invocation_id) gid: vec3u) {
    let size = vec2i(textureDimensions(smooth_src));
    let p = vec2i(gid.xy);
    if (p.x >= size.x || p.y >= size.y) { return; }
    let dir = select(vec2i(1, 0), vec2i(0, 1), water_smooth.direction == 1u);
    var sum = 0.0;
    var weight = 0.0;
    for (var k: i32 = -4; k <= 4; k = k + 1) {
        let q = clamp(p + dir * k, vec2i(0), size - 1);
        let w = exp(-f32(k * k) / 8.0);
        sum = sum + textureLoad(smooth_src, q, 0).x * w;
        weight = weight + w;
    }
    textureStore(smooth_dst, p, vec4f(sum / weight, 0.0, 0.0, 0.0));
}
