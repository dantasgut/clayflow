// Apresentação (spec 011, R2): operadores de mapeamento de tons, codificação sRGB e pontilhamento — o último passo do
// quadro, do HDR linear da cena para a tela. A referência de CPU é `elements/material/reference/tonemap.ts`.
// Requer: nada.

// AgX (Sobotka, aproximação polinomial do Blender 4): linear → linear de exibição em [0, 1].
fn tonemap_agx(c: vec3f) -> vec3f {
    let agx_in = mat3x3f(
        vec3f(0.842479062253094, 0.0423282422610123, 0.0423756549057051),
        vec3f(0.0784335999999992, 0.878468636469772, 0.0784336),
        vec3f(0.0792237451477643, 0.0791661274605434, 0.879142973793104),
    );
    let agx_out = mat3x3f(
        vec3f(1.19687900512017, -0.0528968517574562, -0.0529716355144438),
        vec3f(-0.0980208811401368, 1.15190312990417, -0.0980434501171241),
        vec3f(-0.0990297440797205, -0.0989611768448433, 1.15107367264116),
    );
    let min_ev = -12.47393;
    let max_ev = 4.026069;
    let v = agx_in * c;
    let ev = log2(max(v, vec3f(1e-10)));
    let x = clamp((ev - min_ev) / (max_ev - min_ev), vec3f(0.0), vec3f(1.0));
    let x2 = x * x;
    let x4 = x2 * x2;
    let curved = 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4 - 6.868 * x2 * x + 0.4298 * x2 + 0.1191 * x - 0.00232;
    return pow(clamp(agx_out * curved, vec3f(0.0), vec3f(1.0)), vec3f(2.2));
}

// ACES pelo ajuste RRT+ODT de Stephen Hill: linear → linear de exibição em [0, 1].
fn tonemap_aces(c: vec3f) -> vec3f {
    let aces_in = mat3x3f(
        vec3f(0.59719, 0.076, 0.0284),
        vec3f(0.35458, 0.90834, 0.13383),
        vec3f(0.04823, 0.01566, 0.83777),
    );
    let aces_out = mat3x3f(
        vec3f(1.60475, -0.10208, -0.00327),
        vec3f(-0.53108, 1.10813, -0.07276),
        vec3f(-0.07367, -0.00605, 1.07602),
    );
    let v = aces_in * c;
    let fit = (v * (v + 0.0245786) - 0.000090537) / (v * (0.983729 * v + 0.432951) + 0.238081);
    return clamp(aces_out * fit, vec3f(0.0), vec3f(1.0));
}

// Khronos PBR Neutral: identidade até ~0,76, compressão suave acima, sem mudar a matiz.
fn tonemap_neutral(c: vec3f) -> vec3f {
    let start = 0.8 - 0.04;
    let desaturation = 0.15;
    let x = min(c.r, min(c.g, c.b));
    let offset = select(0.04, x - 6.25 * x * x, x < 0.08);
    var color = c - offset;
    let peak = max_channel(color);
    if (peak < start) { return color; }
    let d = 1.0 - start;
    let new_peak = 1.0 - d * d / (peak + d - start);
    color = color * (new_peak / peak);
    let g = 1.0 - 1.0 / (desaturation * (peak - new_peak) + 1.0);
    return mix(color, vec3f(new_peak), g);
}

// Pontilhamento triangular de ±1 nível de código (8 bits) por ruído de gradiente intercalado (Jimenez 2014), aplicado
// depois da codificação: quebra as faixas dos gradientes lentos sem textura.
fn present_dither(c: vec3f, pixel: vec2u) -> vec3f {
    let p = vec2f(pixel);
    let a = fract(52.9829189 * fract(dot(p, vec2f(0.06711056, 0.00583715))));
    let b = fract(52.9829189 * fract(dot(p + vec2f(37.0, 17.0), vec2f(0.06711056, 0.00583715))));
    return c + vec3f(a + b - 1.0) / 255.0;
}
