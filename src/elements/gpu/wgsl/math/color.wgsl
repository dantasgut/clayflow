// Cor (spec 005, R7; spec 037, R2): a definição única da luminância (Rec.709 de luz linear), do maior canal, de
// YCoCg, da curva sRGB (codificação em [0, 1], estendida para HDR e decodificação), da gradação gama e do
// desempacotar de RGB em meia precisão. O mapeamento de tons está no módulo `present` (spec 011). Referência f64:
// `elements/math/reference/color.ts`.

// Luminância Rec.709 de luz linear.
fn luminance(c: vec3f) -> f32 {
    return dot(c, vec3f(0.2126, 0.7152, 0.0722));
}

// O maior canal.
fn max_channel(c: vec3f) -> f32 {
    return max(c.r, max(c.g, c.b));
}

// RGB → YCoCg (Y, Co, Cg).
fn ycocg(c: vec3f) -> vec3f {
    return vec3f(
        0.25 * c.r + 0.5 * c.g + 0.25 * c.b,
        0.5 * c.r - 0.5 * c.b,
        -0.25 * c.r + 0.5 * c.g - 0.25 * c.b,
    );
}

// YCoCg → RGB.
fn ycocg_inverse(y: vec3f) -> vec3f {
    return vec3f(y.x + y.y - y.z, y.x + y.z, y.x - y.y - y.z);
}

// A curva de codificação sRGB (IEC 61966-2-1) sobre um valor já limitado.
fn srgb_curve(x: vec3f) -> vec3f {
    return select(1.055 * pow(x, vec3f(1.0 / 2.4)) - 0.055, 12.92 * x, x <= vec3f(0.0031308));
}

// Codificação sRGB em [0, 1].
fn srgb_encode(c: vec3f) -> vec3f {
    return srgb_curve(clamp(c, vec3f(0.0), vec3f(1.0)));
}

// Codificação sRGB estendida (saída HDR): a mesma curva, sem corte acima do branco de referência (1).
fn srgb_encode_extended(c: vec3f) -> vec3f {
    return srgb_curve(max(c, vec3f(0.0)));
}

// Decodificação sRGB para luz linear (entrada em [0, 1]).
fn srgb_decode(c: vec3f) -> vec3f {
    return select(pow((c + 0.055) / 1.055, vec3f(2.4)), c / 12.92, c <= vec3f(0.04045));
}

// Gradação gama: c^(1/γ).
fn grade_gamma(c: vec3f, gamma: f32) -> vec3f {
    return pow(c, vec3<f32>(1.0 / gamma));
}

// RGB guardado em meia precisão em dois u32 (`pack2x16float` de rg e de b).
fn unpack_half_rgb(p: vec2u) -> vec3f {
    return vec3f(unpack2x16float(p.x), unpack2x16float(p.y).x);
}
