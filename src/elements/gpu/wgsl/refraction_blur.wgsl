// Desfoque da rugosidade da transmissão (spec 034, R5): o raio central do traçado é nítido; a rugosidade abre um cone
// (α = rugosidade²) e o borra, em espaço de tela, num filtro separável — raio em pixels = α × a distância percorrida
// depois da face (a de `refraction_radiance.a`), projetada na distância da face à câmera; pesos gaussianos e pela
// semelhança da distância vista (um objeto perto não mistura com o fundo longe). Só nos pixels com pedido e
// rugosidade; os demais copiam. O desfoque depois do traçado não depende da ampliação da lente.
// Requer: refraction_codec, cameras, refraction_frame, refraction, refraction_request, refraction_distance.

const REFRACTION_BLUR_MAX: i32 = 24;

/** Raio do desfoque (pixels) no pixel com o pedido `req` e a radiância `center`; 0 sem desfoque. */
fn refraction_blur_radius(pixel: vec2i, req: vec4u, center: vec4f) -> f32 {
    if (refraction.roughnessBlur == 0u || refraction_unpack_tint(req.w).a <= 0.0) { return 0.0; }
    let rough = unpack2x16float(req.z).x;
    if (rough <= 0.0) { return 0.0; }
    let cam = cameras[refraction_frame.cameraSlot];
    let face = max(textureLoad(refraction_distance, pixel, 0).r, 1e-3);
    let height = f32(textureDimensions(refraction_distance).y);
    // Pixels por metro na distância da face (perspectiva) ou fixos (ortográfica).
    let per_meter = select(
        cam.projection[1].y * height * 0.5 / face,
        cam.projection[1].y * height * 0.5,
        cam.projection[3].w == 1.0,
    );
    return min(rough * rough * center.a * per_meter, f32(REFRACTION_BLUR_MAX));
}

/** Uma passada do filtro na direção `axis` sobre `src`. */
fn refraction_blur_pass(src: texture_2d<f32>, pixel: vec2i, axis: vec2i) -> vec4f {
    let center = textureLoad(src, pixel, 0);
    let req = textureLoad(refraction_request, pixel, 0);
    let radius = refraction_blur_radius(pixel, req, center);
    if (radius < 0.5) { return center; }
    let size = vec2i(textureDimensions(src));
    let sigma = max(radius * 0.5, 0.5);
    let taps = i32(ceil(radius));
    var sum = vec3f(0.0);
    var weight = 0.0;
    for (var k = -taps; k <= taps; k++) {
        let q = clamp(pixel + axis * k, vec2i(0), size - vec2i(1));
        let r = textureLoad(refraction_request, q, 0);
        if (refraction_unpack_tint(r.w).a <= 0.0) { continue; }
        let s = textureLoad(src, q, 0);
        let near = exp(-abs(s.a - center.a) / max(0.1 * center.a, 1e-3));
        let w = exp(-f32(k * k) / (2.0 * sigma * sigma)) * near;
        sum = sum + s.rgb * w;
        weight = weight + w;
    }
    return vec4f(sum / max(weight, 1e-6), center.a);
}
