// Referência f64 única da cor (spec 037, R2): a curva sRGB (IEC 61966-2-1) e a luminância Rec.709 de luz linear, como
// o módulo WGSL `color`.

const clamp01 = (x: number): number => Math.min(Math.max(x, 0), 1);

/** Codificação sRGB de luz linear em [0, 1]. */
export function srgbEncode(x: number): number {
    const c = clamp01(x);
    return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

/** Decodificação sRGB para luz linear. */
export function srgbDecode(x: number): number {
    const c = clamp01(x);
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** Pesos Rec.709 da luminância de luz linear. */
export const LUMINANCE_REC709 = [0.2126, 0.7152, 0.0722] as const;

/** Luminância Rec.709 de luz linear. */
export const luminance = (c: readonly [number, number, number]): number =>
    LUMINANCE_REC709[0] * c[0] + LUMINANCE_REC709[1] * c[1] + LUMINANCE_REC709[2] * c[2];
