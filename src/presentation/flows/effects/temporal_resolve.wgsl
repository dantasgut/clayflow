// Resolução temporal (spec 034, R3): a cor da cena deste quadro (com a amostra deslocada dentro do pixel) somada ao
// histórico reprojetado. O ponto do pixel vem da profundidade e da `unjitteredViewProjection` atual; a posição dele no
// quadro anterior, da `previousViewProjection`. O histórico é lido com Catmull–Rom (5 leituras bilineares) e, no modo
// temporal, recortado pela variância da vizinhança 3 × 3 da cor atual em YCoCg (o que mudou atrás — desoclusão, objeto
// que passou, o que se vê através do vidro — cai para a vizinhança atual e não deixa rastro); a mistura é feita com o
// peso de Karis (1 / (1 + luma)), sem que um realce isolado domine. No modo de acumulação, média uniforme de todos os
// quadros desde o corte, sem recorte (a referência de imagem parada). O alfa guarda quantos quadros o histórico tem.
// Corte de câmera (`history.x`), primeiro quadro e ponto que sai da tela recomeçam.
// Requer: fullscreen, color (luminance), CameraMatrices (cameras), taa_params, src_tex (cor), taa_history, taa_depth,
// src_smp.

const TAA_TEMPORAL: u32 = 1u;
const TAA_ACCUMULATE: u32 = 3u;
/** Peso mínimo do quadro novo no modo temporal (≈ 10 quadros de memória). */
const TAA_MIN_ALPHA: f32 = 0.1;
/** Largura do recorte em desvios-padrão da vizinhança. */
const TAA_GAMMA: f32 = 1.0;
/** Quadros máximos do histórico no modo de acumulação. */
const TAA_MAX_FRAMES: f32 = 4096.0;

fn taa_ycocg(c: vec3f) -> vec3f {
    return vec3f(
        0.25 * c.r + 0.5 * c.g + 0.25 * c.b,
        0.5 * c.r - 0.5 * c.b,
        -0.25 * c.r + 0.5 * c.g - 0.25 * c.b,
    );
}

fn taa_rgb(y: vec3f) -> vec3f {
    return vec3f(y.x + y.y - y.z, y.x + y.z, y.x - y.y - y.z);
}

/** Inversa geral 4 × 4 (cofatores). */
fn taa_inverse(m: mat4x4f) -> mat4x4f {
    let a00 = m[0][0]; let a01 = m[0][1]; let a02 = m[0][2]; let a03 = m[0][3];
    let a10 = m[1][0]; let a11 = m[1][1]; let a12 = m[1][2]; let a13 = m[1][3];
    let a20 = m[2][0]; let a21 = m[2][1]; let a22 = m[2][2]; let a23 = m[2][3];
    let a30 = m[3][0]; let a31 = m[3][1]; let a32 = m[3][2]; let a33 = m[3][3];
    let b00 = a00 * a11 - a01 * a10;
    let b01 = a00 * a12 - a02 * a10;
    let b02 = a00 * a13 - a03 * a10;
    let b03 = a01 * a12 - a02 * a11;
    let b04 = a01 * a13 - a03 * a11;
    let b05 = a02 * a13 - a03 * a12;
    let b06 = a20 * a31 - a21 * a30;
    let b07 = a20 * a32 - a22 * a30;
    let b08 = a20 * a33 - a23 * a30;
    let b09 = a21 * a32 - a22 * a31;
    let b10 = a21 * a33 - a23 * a31;
    let b11 = a22 * a33 - a23 * a32;
    let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
    let inv = 1.0 / det;
    return mat4x4f(
        vec4f(a11 * b11 - a12 * b10 + a13 * b09, a02 * b10 - a01 * b11 - a03 * b09, a31 * b05 - a32 * b04 + a33 * b03, a22 * b04 - a21 * b05 - a23 * b03) * inv,
        vec4f(a12 * b08 - a10 * b11 - a13 * b07, a00 * b11 - a02 * b08 + a03 * b07, a32 * b02 - a30 * b05 - a33 * b01, a20 * b05 - a22 * b02 + a23 * b01) * inv,
        vec4f(a10 * b10 - a11 * b08 + a13 * b06, a01 * b08 - a00 * b10 - a03 * b06, a30 * b04 - a31 * b02 + a33 * b00, a21 * b02 - a20 * b04 - a23 * b00) * inv,
        vec4f(a11 * b07 - a10 * b09 - a12 * b06, a00 * b09 - a01 * b07 + a02 * b06, a31 * b01 - a30 * b03 - a32 * b00, a20 * b03 - a21 * b01 + a22 * b00) * inv,
    );
}

/** Histórico em `uv` por Catmull–Rom com 5 leituras bilineares (Jimenez 2016). */
fn taa_history_catmull(uv: vec2f, size: vec2f) -> vec4f {
    let pos = uv * size;
    let center = floor(pos - 0.5) + 0.5;
    let f = pos - center;
    let w0 = f * (-0.5 + f * (1.0 - 0.5 * f));
    let w1 = 1.0 + f * f * (-2.5 + 1.5 * f);
    let w2 = f * (0.5 + f * (2.0 - 1.5 * f));
    let w3 = f * f * (-0.5 + 0.5 * f);
    let w12 = w1 + w2;
    let tc12 = (center + w2 / w12) / size;
    let tc0 = (center - 1.0) / size;
    let tc3 = (center + 2.0) / size;
    var sum = vec4f(0.0);
    sum += textureSampleLevel(taa_history, src_smp, vec2f(tc12.x, tc0.y), 0.0) * (w12.x * w0.y);
    sum += textureSampleLevel(taa_history, src_smp, vec2f(tc0.x, tc12.y), 0.0) * (w0.x * w12.y);
    sum += textureSampleLevel(taa_history, src_smp, tc12, 0.0) * (w12.x * w12.y);
    sum += textureSampleLevel(taa_history, src_smp, vec2f(tc3.x, tc12.y), 0.0) * (w3.x * w12.y);
    sum += textureSampleLevel(taa_history, src_smp, vec2f(tc12.x, tc3.y), 0.0) * (w12.x * w3.y);
    let weight = w12.x * w0.y + w0.x * w12.y + w12.x * w12.y + w3.x * w12.y + w12.x * w3.y;
    return max(sum / weight, vec4f(0.0));
}

@fragment
fn fs_temporal_resolve(in: VsOut) -> @location(0) vec4f {
    let dims = textureDimensions(src_tex, 0);
    let size = vec2f(dims);
    let pixel = vec2i(in.clip_position.xy);
    let current = textureLoad(src_tex, pixel, 0).rgb;
    let cam = cameras[taa_params.cameraSlot];
    // Onde o ponto do pixel estava no quadro anterior.
    let depth = textureLoad(taa_depth, pixel, 0);
    let ndc = vec2f(in.uv.x * 2.0 - 1.0, 1.0 - in.uv.y * 2.0);
    let world = taa_inverse(cam.unjitteredViewProjection) * vec4f(ndc, depth, 1.0);
    let prev = cam.previousViewProjection * vec4f(world.xyz / world.w, 1.0);
    let prev_uv = vec2f(prev.x / prev.w * 0.5 + 0.5, 0.5 - prev.y / prev.w * 0.5);
    let inside = prev.w > 0.0 && all(prev_uv >= vec2f(0.0)) && all(prev_uv <= vec2f(1.0));
    let history = taa_history_catmull(prev_uv, size);
    let frames = select(0.0, history.a, inside && cam.history.x == 0.0);
    if (taa_params.mode == TAA_ACCUMULATE) {
        let n = min(frames, TAA_MAX_FRAMES - 1.0);
        let rgb = mix(history.rgb, current, 1.0 / (n + 1.0));
        return vec4f(select(current, rgb, n > 0.0), n + 1.0);
    }
    // Vizinhança 3 × 3 em YCoCg: média e desvio para recortar o histórico.
    var m1 = vec3f(0.0);
    var m2 = vec3f(0.0);
    for (var dy = -1; dy <= 1; dy++) {
        for (var dx = -1; dx <= 1; dx++) {
            let q = clamp(pixel + vec2i(dx, dy), vec2i(0), vec2i(dims) - 1);
            let c = taa_ycocg(textureLoad(src_tex, q, 0).rgb);
            m1 += c;
            m2 += c * c;
        }
    }
    let mean = m1 / 9.0;
    let sigma = sqrt(max(m2 / 9.0 - mean * mean, vec3f(0.0)));
    let lo = mean - TAA_GAMMA * sigma;
    let hi = mean + TAA_GAMMA * sigma;
    // Recorte em direção à média (Salvi): o histórico fora da caixa vem para a borda dela.
    let h = taa_ycocg(history.rgb);
    let d = h - mean;
    let extent = max(hi - mean, vec3f(1e-6));
    let scale = max(abs(d) / extent, vec3f(1.0));
    let clipped = taa_rgb(mean + d / max(scale.x, max(scale.y, scale.z)));
    let alpha = max(1.0 / (frames + 1.0), TAA_MIN_ALPHA);
    // Mistura com o peso de Karis (em luminância comprimida).
    let wc = alpha / (1.0 + luminance(current));
    let wh = (1.0 - alpha) / (1.0 + luminance(clipped));
    let rgb = select(current, (current * wc + clipped * wh) / (wc + wh), frames > 0.0);
    return vec4f(rgb, min(frames + 1.0, TAA_MAX_FRAMES));
}
