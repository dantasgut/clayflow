// Codificação do pedido de refração e do acerto traçado (spec 034): quem grava (os pedidos do vidro e da água, o traçado)
// e quem lê (o traçado, a luz no acerto, o desfoque, as composições) usam as mesmas funções.
//   - Pedido (`refraction_request`, rgba32uint): x = normal (octaédrica, 2 × snorm16), y = (IOR, Abbe) em f16, z =
//     (rugosidade, distância da absorção) em f16 — rugosidade −1 marca a parede fina e −2 a entrada num volume (a água) —,
//     w = cor da absorção e peso
//     (4 × 8 bits; peso 0 = sem pedido). `refraction_distance` (r32float): a distância da câmera ao ponto ao longo do raio
//     do pixel (perspectiva) ou do eixo da vista (ortográfica).
// A cor e o peso vão em 4 × 8 bits empacotados à mão: `pack4x8unorm` saía zerado no passe de pedidos (Chrome, Metal).
// Requer: CameraMatrices (struct).

fn refraction_pack_tint(v: vec4f) -> u32 {
    let b = vec4u(round(clamp(v, vec4f(0.0), vec4f(1.0)) * 255.0));
    return b.x | (b.y << 8u) | (b.z << 16u) | (b.w << 24u);
}

fn refraction_unpack_tint(u: u32) -> vec4f {
    return vec4f(f32(u & 255u), f32((u >> 8u) & 255u), f32((u >> 16u) & 255u), f32(u >> 24u)) / 255.0;
}

fn refraction_oct_encode(n: vec3f) -> vec2f {
    let a = n / (abs(n.x) + abs(n.y) + abs(n.z));
    if (a.z >= 0.0) { return a.xy; }
    return (vec2f(1.0) - abs(a.yx)) * select(vec2f(-1.0), vec2f(1.0), a.xy >= vec2f(0.0));
}

fn refraction_oct_decode(e: vec2f) -> vec3f {
    var n = vec3f(e.x, e.y, 1.0 - abs(e.x) - abs(e.y));
    let t = max(-n.z, 0.0);
    n.x = n.x + select(t, -t, n.x >= 0.0);
    n.y = n.y + select(t, -t, n.y >= 0.0);
    return normalize(n);
}

/** Distância ao longo do raio do pixel (perspectiva) ou do eixo da vista (ortográfica): a que o traçado reconstrói. */
fn refraction_ray_distance(cam: CameraMatrices, p: vec3f) -> f32 {
    let back = vec3f(cam.view[0].z, cam.view[1].z, cam.view[2].z);
    return select(distance(cam.position.xyz, p), dot(cam.position.xyz - p, back), cam.projection[3].w == 1.0);
}

/** Rugosidade gravada no pedido para a parede fina e para a entrada num volume. */
const REFRACTION_THIN: f32 = -1.0;
const REFRACTION_VOLUME: f32 = -2.0;

/**
 * O pedido de um ponto: normal do lobo, IOR e Abbe, rugosidade (ou a parede fina, ou a entrada num volume), absorção e
 * peso.
 */
fn refraction_request_of(n: vec3f, ior: f32, abbe: f32, roughness: f32, kind: f32, color: vec3f, depth: f32, weight: f32) -> vec4u {
    return vec4u(
        pack2x16snorm(refraction_oct_encode(n)),
        pack2x16float(vec2f(max(ior, 1.0), abbe)),
        pack2x16float(vec2f(select(roughness, kind, kind < 0.0), depth)),
        refraction_pack_tint(vec4f(color, max(weight, 1.0 / 255.0))),
    );
}
