// Referência em CPU do módulo WGSL `fixed_point` (spec 005, research R10), em aritmética de f32 (`Math.fround`).
// Usada pelo smoke `computeKernels` e testada em `src/elements/gpu/__tests__/fixedPoint.test.ts`.

/** Maior f32 abaixo de 2³¹ (`FIXED_LIMIT`). */
export const FIXED_LIMIT = 2147483520;

const f32 = Math.fround;

/** `round` do WGSL: inteiro mais próximo, empate para o par. */
export function roundHalfEven(x: number): number {
    const r = Math.round(x);
    return Math.abs(x % 1) === 0.5 && r % 2 !== 0 ? r - 1 : r;
}

/** `fixed_from_f32(x, scale)`. */
export function fixedFromF32(x: number, scale: number): number {
    const scaled = f32(f32(x) * f32(scale));
    return roundHalfEven(Math.min(Math.max(scaled, -FIXED_LIMIT), FIXED_LIMIT));
}

/** `fixed_to_f32(v, scale)`. */
export function fixedToF32(v: number, scale: number): number {
    return f32(f32(v) / f32(scale));
}

/** `fixed_saturated(x, scale)`. */
export function fixedSaturated(x: number, scale: number): boolean {
    return Math.abs(f32(f32(x) * f32(scale))) >= FIXED_LIMIT;
}
