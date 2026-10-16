// Suavização da superfície de água (spec 017): filtro separável de faixa estreita sobre a profundidade linear (van der
// Laan et al. 2009; Truong e Yuksel 2018). Um passo por direção; o raio em pixels é o raio da suavização do material
// projetado na profundidade do pixel. Amostras sem água, de outro material ou atrás além do limiar de descontinuidade
// não entram (silhuetas preservadas); as da frente além do limiar são grampeadas a ele. A espessura passa por um
// borrão gaussiano curto. Structs `CameraMatrices`, `WaterLightMatrix`, `FluidSurfaceMaterial` e `WaterSmoothParams`
// gerados dos schemas; recursos declarados em `water/shaders.ts`.

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
    // Direção do passo: eixos (0, 1) e diagonais (2, 3), alternados entre iterações — só os eixos deixam filetes
    // alinhados a eles em lâminas finas.
    let dirs = array<vec2i, 4>(vec2i(1, 0), vec2i(0, 1), vec2i(1, 1), vec2i(1, -1));
    let dir = dirs[min(water_smooth.direction, 3u)];
    let unit = length(vec2f(dir));
    let reach = radius_px / unit;
    let step = max(1, i32(ceil(reach / f32(WATER_MAX_TAPS))));
    let taps = min(WATER_MAX_TAPS, i32(ceil(reach / f32(step))));
    let sigma = radius_px * 0.5;
    let threshold = material.depthThreshold * r;
    // Inclinação local (diferença central entre vizinhos da mesma superfície): numa superfície rasante a profundidade
    // muda muito por pixel, e o limiar acompanha o plano — senão os vizinhos seriam rejeitados e a suavização sumiria.
    let zp = textureLoad(smooth_src, clamp(p + dir, vec2i(0), size - 1), 0).x;
    let zm = textureLoad(smooth_src, clamp(p - dir, vec2i(0), size - 1), 0).x;
    var slope = 0.0;
    if (abs(zp - z) < threshold && abs(z - zm) < threshold) {
        slope = min(0.5 * abs(zp - zm), threshold);
    }
    var sum = z;
    var weight = 1.0;
    for (var k: i32 = 1; k <= taps; k = k + 1) {
        let offset = k * step;
        let dist = f32(offset) * unit;
        let w_space = exp(-(dist * dist) / (2.0 * sigma * sigma));
        for (var s: i32 = -1; s <= 1; s = s + 2) {
            let q = clamp(p + dir * offset * s, vec2i(0), size - 1);
            let zq = textureLoad(smooth_src, q, 0).x;
            let mq = textureLoad(smooth_material, q, 0).x;
            if (mq != m || zq >= WATER_NO_DEPTH) { continue; }
            // Faixa estreita: amostra atrás além do limiar é outra superfície (ignorada); à frente, grampeada ao
            // limiar — a borda não "puxa" o centro e lâminas finas não viram filetes.
            let allowed = threshold + slope * f32(offset);
            if (zq > z + allowed) { continue; }
            let zc = max(zq, z - allowed);
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
