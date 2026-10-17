// Referência em CPU da apresentação (spec 011, R2): os operadores de mapeamento de tons e a codificação sRGB do módulo
// WGSL `present`, com a mesma aritmética, para os testes e o smoke `hdr`.

import type { Vec3 } from './bsdf';

const clamp01 = (x: number): number => Math.min(Math.max(x, 0), 1);

/** Multiplica a matriz 3×3 (linhas) pelo vetor. */
function apply(m: readonly (readonly number[])[], v: Vec3): Vec3 {
    return [
        m[0]![0]! * v[0] + m[0]![1]! * v[1] + m[0]![2]! * v[2],
        m[1]![0]! * v[0] + m[1]![1]! * v[1] + m[1]![2]! * v[2],
        m[2]![0]! * v[0] + m[2]![1]! * v[1] + m[2]![2]! * v[2],
    ];
}

/** Matriz de entrada do AgX (primárias sRGB, a do Blender 4 / Sobotka), por linhas. */
const AGX_IN = [
    [0.842479062253094, 0.0784335999999992, 0.0792237451477643],
    [0.0423282422610123, 0.878468636469772, 0.0791661274605434],
    [0.0423756549057051, 0.0784336, 0.879142973793104],
] as const;

/** Matriz de saída do AgX (inversa da de entrada), por linhas. */
const AGX_OUT = [
    [1.19687900512017, -0.0980208811401368, -0.0990297440797205],
    [-0.0528968517574562, 1.15190312990417, -0.0989611768448433],
    [-0.0529716355144438, -0.0980434501171241, 1.15107367264116],
] as const;

const AGX_MIN_EV = -12.47393;
const AGX_MAX_EV = 4.026069;

/** Contraste "base" do AgX: o polinômio de 6º grau que aproxima a sigmoide da curva. */
function agxContrast(x: number): number {
    const x2 = x * x;
    const x4 = x2 * x2;
    return (
        15.5 * x4 * x2
        - 40.14 * x4 * x
        + 31.96 * x4
        - 6.868 * x2 * x
        + 0.4298 * x2
        + 0.1191 * x
        - 0.00232
    );
}

/** AgX (Sobotka, aproximação polinomial do Blender 4): linear → linear de exibição em [0, 1]. */
export function tonemapAgx(c: Vec3): Vec3 {
    const v = apply(AGX_IN, c);
    const curved = v.map((x) => {
        const ev = Math.log2(Math.max(x, 1e-10));
        const t = clamp01((ev - AGX_MIN_EV) / (AGX_MAX_EV - AGX_MIN_EV));
        return agxContrast(t);
    }) as unknown as Vec3;
    const out = apply(AGX_OUT, curved);
    return out.map((x) => Math.pow(clamp01(x), 2.2)) as unknown as Vec3;
}

const ACES_IN = [
    [0.59719, 0.35458, 0.04823],
    [0.076, 0.90834, 0.01566],
    [0.0284, 0.13383, 0.83777],
] as const;

const ACES_OUT = [
    [1.60475, -0.53108, -0.07367],
    [-0.10208, 1.10813, -0.00605],
    [-0.00327, -0.07276, 1.07602],
] as const;

/** ACES pelo ajuste RRT+ODT de Stephen Hill: linear → linear de exibição em [0, 1]. */
export function tonemapAces(c: Vec3): Vec3 {
    const v = apply(ACES_IN, c);
    const fit = v.map(
        (x) => (x * (x + 0.0245786) - 0.000090537) / (x * (0.983729 * x + 0.432951) + 0.238081),
    ) as unknown as Vec3;
    return apply(ACES_OUT, fit).map(clamp01) as unknown as Vec3;
}

/** Khronos PBR Neutral: identidade até ~0,76, compressão suave acima, sem mudar a matiz. */
export function tonemapNeutral(c: Vec3): Vec3 {
    const start = 0.8 - 0.04;
    const desaturation = 0.15;
    const x = Math.min(c[0], c[1], c[2]);
    const offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
    let r = c[0] - offset;
    let g = c[1] - offset;
    let b = c[2] - offset;
    const peak = Math.max(r, g, b);
    if (peak < start) return [r, g, b];
    const d = 1 - start;
    const newPeak = 1 - (d * d) / (peak + d - start);
    const k = newPeak / peak;
    r *= k;
    g *= k;
    b *= k;
    const t = 1 - 1 / (desaturation * (peak - newPeak) + 1);
    return [r + (newPeak - r) * t, g + (newPeak - g) * t, b + (newPeak - b) * t];
}

/** Codificação sRGB (curva por partes da IEC 61966-2-1). */
export function srgbEncode(x: number): number {
    const c = clamp01(x);
    return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

/** Decodificação sRGB. */
export function srgbDecode(x: number): number {
    const c = clamp01(x);
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** Operadores da apresentação. */
export type ToneOperator = 'agx' | 'aces' | 'neutral' | 'linear';

/** Apresentação completa de uma cor linear (sem pontilhamento): exposição em EV, operador e sRGB, em [0, 1]. */
export function present(c: Vec3, operator: ToneOperator, exposureEv: number): Vec3 {
    const k = Math.pow(2, exposureEv);
    const e: Vec3 = [c[0] * k, c[1] * k, c[2] * k];
    const mapped =
        operator === 'agx'
            ? tonemapAgx(e)
            : operator === 'aces'
              ? tonemapAces(e)
              : operator === 'neutral'
                ? tonemapNeutral(e)
                : e;
    return mapped.map(srgbEncode) as unknown as Vec3;
}
