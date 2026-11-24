// A superfície por trás das nuvens (spec 041, R2): a distância da câmera à superfície opaca de um pixel da tela e a
// menor entre os S × S pixels da tela de um texel do alvo reconstruído — até onde a marcha dele vai. A reconstrução e o
// aumento só juntam valores marchados até a mesma superfície: o valor do céu (a nuvem rente ao horizonte) não entra num
// texel do chão, nem o do chão (sem nuvem na frente) num do céu.
// Requer: cloud_march_bayer, cloud_scene_depth, camera_space, cameras.

/** A distância guardada do fundo (nenhuma superfície), m. */
const CLOUD_SKY_DISTANCE: f32 = 1e7;
/**
 * Diferença relativa até a qual duas distâncias de superfície são a mesma superfície para as nuvens: no chão visto
 * rente, a distância muda até 2 × de um texel para o seguinte, sem nuvem nenhuma entre eles; o céu (1e7 m) contra o chão
 * ou a montanha (até dezenas de km) difere por ordens de grandeza.
 */
const CLOUD_SURFACE_AGREE: f32 = 1.0;

/** Distância (m) da câmera `slot` até a superfície opaca no pixel `px` (∞ no fundo). */
fn cloud_surface_distance(slot: u32, px: vec2i, size: vec2f) -> f32 {
    let z = cloud_scene_depth(px);
    if (z >= 1.0) { return 1e30; }
    let cam = cameras[slot];
    let ndc = pixel_to_ndc(vec2f(px) + 0.5, size);
    let w = cam.inverseUnjitteredViewProjection * vec4f(ndc, z, 1.0);
    return length(w.xyz / w.w - cam.position.xyz);
}

/**
 * A menor distância à superfície entre os S × S pixels da tela do pixel `q` do alvo reconstruído (S a escala dele; teto
 * constante de 16 leituras).
 */
fn cloud_block_distance(slot: u32, q: vec2u) -> f32 {
    let size = vec2i(cloud_scene_depth_size());
    let scale = i32(cloud_march_scale());
    let base = vec2i(q) * scale;
    var d = 1e30;
    for (var k = 0; k < 16; k++) {
        if (k >= scale * scale) { break; }
        let px = min(base + vec2i(k % scale, k / scale), size - 1);
        d = min(d, cloud_surface_distance(slot, px, vec2f(size)));
    }
    return d;
}


/** A diferença relativa entre as distâncias de superfície `a` e `b` (m). */
fn cloud_surface_differs(a: f32, b: f32) -> f32 {
    return abs(a - b) / max(min(a, b), 1.0);
}
