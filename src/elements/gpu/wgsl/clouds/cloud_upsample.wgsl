// Aumento das nuvens para a tela (spec 041, R2): por pixel da tela, os 4 pixels vizinhos do alvo reconstruído (¼ da
// tela; 1/16 no perfil baixo)
// (bilinear) pesados pela semelhança da distância da superfície — a do pixel da tela contra a superfície até onde o valor
// de cada texel foi marchado (`cloud_march_depth_now.g`, a menor dos pixels da tela que ele cobre) —: a nuvem não vaza
// para a frente da montanha nem some do céu ao lado dela.
// Um grupo por bloco de `CLOUD_TILE`² pixels da tela (T074): o grupo marca o bloco (`cloud_tiles_out`, 1 = algum pixel
// muda a cor ao compor) — a lista dos blocos da composição (`cloud_tiles.wgsl`) sai da GPU, sem leitura na CPU. O
// primeiro grupo zera a contagem da lista do quadro (`cloud_tile_args[3]`), que o passe da lista, depois deste, soma.
// Requer: CLOUD_TILE, cloud_common, cloud_scene_limit, cloud_scene_depth, camera_space, clouds, cameras, sky (os
// parâmetros), cloud_march_now, cloud_march_depth_now, cloud_view_out, cloud_tiles_out, cloud_tile_args.

// O pixel cuja composição não muda a cor guardada (a mesma regra da composição, `sky_composite.wgsl`): a transmitância a
// menos de 2⁻¹² de 1 (meio ULP do `rgba16float`) e a luz abaixo de 2⁻¹² da radiância de uma superfície branca ao sol.
const CLOUD_COMPOSE_EPS: f32 = 1.0 / 4096.0;

var<workgroup> cloud_tile_any: atomic<u32>;

fn cloud_pixel_distance(slot: u32, px: vec2i, size: vec2f) -> f32 {
    return min(cloud_surface_distance(slot, px, size), CLOUD_SKY_DISTANCE);
}

/** A nuvem aumentada no pixel `g` da tela `size`. */
fn cloud_upsample_at(g: vec2u, size: vec2u) -> vec4f {
    let slot = clouds.march.w;
    let full = vec2f(size);
    let quarter = vec2i(textureDimensions(cloud_march_now));
    let here = cloud_pixel_distance(slot, vec2i(g), full);
    // A superfície do pixel mais perto que a casca: nenhuma nuvem na frente dela (sem ler o alvo reconstruído).
    if (here < cloud_shell_nearest(cameras[slot].position.xyz)) { return vec4f(0.0, 0.0, 0.0, 1.0); }
    let scale = cloud_march_scale();
    let c = (vec2f(g) + 0.5) / f32(scale) - 0.5;
    let base = vec2i(floor(c));
    let f = c - floor(c);
    var sum = vec4f(0.0);
    var weight = 0.0;
    for (var k = 0; k < 4; k++) {
        let o = vec2i(k & 1, k >> 1);
        let q = clamp(base + o, vec2i(0), quarter - 1);
        // A superfície até onde o valor do texel foi marchado (a reconstrução a guarda com ele).
        let d = textureLoad(cloud_march_depth_now, q, 0).g;
        let bil = select(1.0 - f.x, f.x, o.x == 1) * select(1.0 - f.y, f.y, o.y == 1);
        let w = max(bil, 1e-3) / (1e-2 + abs(d - here) / max(here, 1.0));
        sum += textureLoad(cloud_march_now, q, 0) * w;
        weight += w;
    }
    return sum / max(weight, 1e-6);
}

/** A composição do valor `v` muda a cor do pixel (a transmitância ou a luz acima da precisão). */
fn cloud_composes(v: vec4f) -> bool {
    let white = max(max(sky.sunIlluminance.r, sky.sunIlluminance.g), sky.sunIlluminance.b) / PI;
    return v.a <= 1.0 - CLOUD_COMPOSE_EPS || any(abs(v.rgb) >= vec3f(CLOUD_COMPOSE_EPS * white));
}

@compute @workgroup_size(CLOUD_TILE * CLOUD_TILE)
fn cloud_upsample_main(
    @builtin(workgroup_id) wid: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
    @builtin(local_invocation_index) li: u32,
) {
    let size = textureDimensions(cloud_view_out);
    let tiles = textureDimensions(cloud_tiles_out);
    let t = wid.x + wid.y * nwg.x;
    let tile = vec2u(t % tiles.x, t / tiles.x);
    let g = tile * CLOUD_TILE + vec2u(li % CLOUD_TILE, li / CLOUD_TILE);
    let valid = t < tiles.x * tiles.y;
    if (t == 0u && li == 0u) { atomicStore(&cloud_tile_args[3], 0u); }
    if (valid && all(g < size)) {
        let v = cloud_upsample_at(g, size);
        textureStore(cloud_view_out, g, v);
        if (cloud_composes(v)) { atomicOr(&cloud_tile_any, 1u); }
    }
    workgroupBarrier();
    if (valid && li == 0u) { textureStore(cloud_tiles_out, tile, vec4u(atomicLoad(&cloud_tile_any), 0u, 0u, 0u)); }
}
